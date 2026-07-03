import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { test, before, after } from 'node:test';
import { pool, query } from '../src/db/pool.js';
import { reapOnce } from '../src/worker/reaper.js';

const hasDb = Boolean(process.env.DATABASE_URL);
const maybe = hasDb ? test : test.skip;

async function resetDb() {
  await query(`TRUNCATE dead_letter_queue, job_logs, job_executions, worker_heartbeats, workers, scheduled_jobs, jobs, retry_policies, queues, projects, organizations, users RESTART IDENTITY CASCADE`);
  const user = await query(`INSERT INTO users(email,password_hash,role) VALUES ('t@s.local','x','admin') RETURNING id`);
  const org = await query(`INSERT INTO organizations(name, owner_id) VALUES ('T',$1) RETURNING id`, [user.rows[0].id]);
  const project = await query(`INSERT INTO projects(org_id,name) VALUES ($1,'P') RETURNING id`, [org.rows[0].id]);
  const queue = await query(`INSERT INTO queues(project_id,name,concurrency_limit) VALUES ($1,'q',4) RETURNING id`, [project.rows[0].id]);
  await query(`INSERT INTO retry_policies(queue_id,max_attempts,base_delay_ms) VALUES ($1,2,50)`, [queue.rows[0].id]);
  return queue.rows[0].id;
}

function runWorker(extraEnv = {}) {
  return spawn(process.execPath, ['src/worker/worker.js'], {
    env: { ...process.env, WORKER_POLL_MS: '100', ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

async function waitFor(predicate, timeoutMs = 12_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('timed out waiting for condition');
}

before(async () => {
  if (hasDb) await query(await fs.readFile(new URL('../schema.sql', import.meta.url), 'utf8'));
});

after(async () => {
  await pool.end();
});

maybe('two workers complete 20 jobs without duplicate execution success rows', async () => {
  const queueId = await resetDb();
  for (let i = 0; i < 20; i += 1) {
    await query(`INSERT INTO jobs(queue_id,type,payload,run_at) VALUES ($1,'immediate',$2,now())`, [queueId, { duration_ms: 80 }]);
  }
  const workers = [runWorker(), runWorker()];
  try {
    await waitFor(async () => {
      const done = await query(`SELECT count(*)::int FROM jobs WHERE status='completed'`);
      return done.rows[0].count === 20;
    });
    const dupes = await query(
      `SELECT job_id, count(*)::int FROM job_executions WHERE result='success' GROUP BY job_id HAVING count(*) > 1`
    );
    assert.equal(dupes.rowCount, 0);
  } finally {
    workers.forEach((worker) => worker.kill('SIGTERM'));
  }
});

maybe('reaper requeues a running job after a worker is killed', async () => {
  const queueId = await resetDb();
  await query(`INSERT INTO jobs(queue_id,type,payload,run_at) VALUES ($1,'immediate',$2,now())`, [queueId, { mode: 'timeout', timeout_ms: 5000 }]);
  const first = runWorker({ HEARTBEAT_STALE_SECONDS: '1' });
  try {
    await waitFor(async () => {
      const running = await query(`SELECT count(*)::int FROM jobs WHERE status='running'`);
      return running.rows[0].count === 1;
    });
    first.kill('SIGKILL');
    await query(`UPDATE worker_heartbeats SET last_seen_at=now() - interval '35 seconds'`);
    const result = await reapOnce();
    assert.equal(result.requeued, 1);
    const second = runWorker();
    try {
      await waitFor(async () => {
        const done = await query(`SELECT count(*)::int FROM jobs WHERE status='completed'`);
        return done.rows[0].count === 1;
      });
    } finally {
      second.kill('SIGTERM');
    }
  } finally {
    first.kill('SIGKILL');
  }
});
