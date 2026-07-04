import 'dotenv/config';
import os from 'node:os';
import { pool, query, withClient } from '../db/pool.js';
import { claimSql } from '../lib/claim.js';
import { nextRunAt } from '../lib/retry.js';
import { summarizeFailure } from '../lib/aiSummary.js';
import { notifyJob, notifyWorker } from '../lib/dbEvents.js';
import { runHandler } from './handlers.js';

let stopping = false;
const inflight = new Set();
const pollMs = Number(process.env.WORKER_POLL_MS || 1000);

async function registerWorker() {
  const { rows } = await query(
    `INSERT INTO workers(hostname, pid, status) VALUES ($1,$2,'idle') RETURNING *`,
    [os.hostname(), process.pid]
  );
  await query(`INSERT INTO worker_heartbeats(worker_id, last_seen_at) VALUES ($1, now())`, [rows[0].id]);
  await notifyWorker(rows[0]);
  return rows[0];
}

async function heartbeat(workerId, status = 'idle') {
  let activeId = workerId;
  let { rows } = await query(
    `UPDATE workers SET status=$2 WHERE id=$1 RETURNING *`,
    [activeId, status]
  );
  if (!rows[0]) {
    console.log(`Worker ID ${activeId} not found in database. Re-registering...`);
    const newWorker = await registerWorker();
    worker = newWorker;
    activeId = newWorker.id;
    const retry = await query(
      `UPDATE workers SET status=$2 WHERE id=$1 RETURNING *`,
      [activeId, status]
    );
    rows = retry.rows;
  }
  await query(
    `INSERT INTO worker_heartbeats(worker_id, last_seen_at) VALUES ($1, now())
     ON CONFLICT (worker_id) DO UPDATE SET last_seen_at=now()`,
    [activeId]
  );
  await notifyWorker(rows[0]);
}

async function markFailed(job, workerId, executionId, error) {
  const policyRows = await query(`SELECT * FROM retry_policies WHERE queue_id=$1`, [job.queue_id]);
  const policy = policyRows.rows[0] || { max_attempts: 3, strategy: 'exponential', base_delay_ms: 1000 };
  const attempt = Number(job.attempt_count) + 1;
  await query(`INSERT INTO job_logs(job_id, level, message) VALUES ($1,'error',$2)`, [job.id, error.message]);
  await query(`UPDATE job_executions SET finished_at=now(), result='failure', error_message=$2 WHERE id=$1`, [executionId, error.message]);
  if (attempt < Number(policy.max_attempts)) {
    const next = nextRunAt(policy, attempt);
    const { rows } = await query(
      `UPDATE jobs SET status='queued', attempt_count=$2, run_at=$3, claimed_by=NULL, claimed_at=NULL WHERE id=$1 RETURNING *`,
      [job.id, attempt, next]
    );
    await notifyJob(rows[0]);
    return;
  }
  const { rows } = await query(
    `UPDATE jobs SET status='dead', attempt_count=$2, claimed_by=NULL, claimed_at=NULL WHERE id=$1 RETURNING *`,
    [job.id, attempt]
  );
  await notifyJob(rows[0]);
  const logs = (await query(`SELECT level, message FROM job_logs WHERE job_id=$1 ORDER BY created_at`, [job.id])).rows;
  const { rows: dlq } = await query(
    `INSERT INTO dead_letter_queue(job_id, final_error, ai_summary) VALUES ($1,$2,$3)
     ON CONFLICT (job_id) DO UPDATE SET final_error=$2, ai_summary=$3 RETURNING *`,
    [job.id, error.message, 'summary pending']
  );
  summarizeFailure({ error: error.message, logs }).then((summary) => {
    query(`UPDATE dead_letter_queue SET ai_summary=$2 WHERE id=$1`, [dlq[0].id, summary]).catch(console.error);
  });
}

async function executeJob(workerId, job) {
  inflight.add(job.id);
  let executionId;
  try {
    await heartbeat(workerId, 'busy');
    const running = await query(`UPDATE jobs SET status='running' WHERE id=$1 RETURNING *`, [job.id]);
    await notifyJob(running.rows[0]);
    const execution = await query(`INSERT INTO job_executions(job_id, worker_id, started_at) VALUES ($1,$2,now()) RETURNING id`, [job.id, workerId]);
    executionId = execution.rows[0].id;
    const result = await runHandler(job);
    await query(`INSERT INTO job_logs(job_id, level, message) VALUES ($1,'info',$2)`, [job.id, JSON.stringify(result)]);
    await query(`UPDATE job_executions SET finished_at=now(), result='success' WHERE id=$1`, [executionId]);
    const { rows } = await query(`UPDATE jobs SET status='completed', claimed_by=NULL, claimed_at=NULL WHERE id=$1 RETURNING *`, [job.id]);
    await notifyJob(rows[0]);
  } catch (error) {
    await markFailed(job, workerId, executionId, error);
  } finally {
    inflight.delete(job.id);
    await heartbeat(workerId, inflight.size ? 'busy' : 'idle');
  }
}

async function claimForQueue(workerId, queue) {
  const available = Number(queue.concurrency_limit) - inflight.size;
  for (let i = 0; i < available && !stopping; i += 1) {
    const { rows } = await query(claimSql, [workerId, queue.id]);
    if (!rows[0]) break;
    await notifyJob(rows[0]);
    executeJob(workerId, rows[0]).catch(console.error);
  }
}

async function poll(workerId) {
  if (stopping) return;
  const { rows: queues } = await query(`SELECT * FROM queues WHERE status='active' ORDER BY priority DESC`);
  for (const queue of queues) await claimForQueue(workerId, queue);
}

let worker = await registerWorker();
const heartbeatTimer = setInterval(() => heartbeat(worker.id, inflight.size ? 'busy' : 'idle').catch(console.error), 5000);
const pollTimer = setInterval(() => poll(worker.id).catch(console.error), pollMs);
await poll(worker.id);

async function shutdown() {
  stopping = true;
  clearInterval(pollTimer);
  clearInterval(heartbeatTimer);
  while (inflight.size) await new Promise((resolve) => setTimeout(resolve, 250));
  await heartbeat(worker.id, 'dead');
  await pool.end();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
console.log(`worker ${worker.id} running`);
