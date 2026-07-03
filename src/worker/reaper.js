import 'dotenv/config';
import { pool, query } from '../db/pool.js';
import { notifyJob, notifyWorker } from '../lib/dbEvents.js';

const staleSeconds = Number(process.env.HEARTBEAT_STALE_SECONDS || 30);

export async function reapOnce() {
  const deadWorkers = await query(
    `UPDATE workers w SET status='dead'
     FROM worker_heartbeats h
     WHERE h.worker_id=w.id AND w.status <> 'dead' AND h.last_seen_at < now() - ($1 || ' seconds')::interval
     RETURNING w.*`,
    [staleSeconds]
  );
  for (const worker of deadWorkers.rows) await notifyWorker(worker);
  const requeued = await query(
    `UPDATE jobs SET status='queued', claimed_by=NULL, claimed_at=NULL
     WHERE status IN ('claimed','running')
       AND claimed_by IN (SELECT id FROM workers WHERE status='dead')
     RETURNING *`
  );
  for (const job of requeued.rows) {
    await query(`INSERT INTO job_logs(job_id, level, message) VALUES ($1,'warn','requeued after stale worker heartbeat')`, [job.id]);
    await notifyJob(job);
  }
  return { deadWorkers: deadWorkers.rowCount, requeued: requeued.rowCount };
}

if (process.argv[1]?.endsWith('reaper.js')) {
  const interval = Number(process.env.REAPER_INTERVAL_MS || 5000);
  setInterval(() => reapOnce().catch(console.error), interval);
  console.log(`reaper running every ${interval}ms`);
}

process.on('SIGTERM', async () => {
  await pool.end();
  process.exit(0);
});
