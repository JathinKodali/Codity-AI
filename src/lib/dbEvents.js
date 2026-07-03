import { pool, query } from '../db/pool.js';
import { emitJobChange, emitWorkerChange, wakeWorkers } from './events.js';

export async function notify(channel, payload) {
  await query(`SELECT pg_notify($1, $2)`, [channel, JSON.stringify(payload)]);
}

export async function notifyJob(job) {
  await notify('scheduler_events', { type: 'job:updated', job });
}

export async function notifyWorker(worker) {
  await notify('scheduler_events', { type: 'worker:status', worker });
}

export async function notifyWake(queueId) {
  await notify('scheduler_events', { type: 'worker:wake', queueId });
}

export async function startDbEventListener() {
  const client = await pool.connect();
  await client.query('LISTEN scheduler_events');
  client.on('notification', (message) => {
    try {
      const payload = JSON.parse(message.payload);
      if (payload.type === 'job:updated') emitJobChange(payload.job);
      if (payload.type === 'worker:status') emitWorkerChange(payload.worker);
      if (payload.type === 'worker:wake') wakeWorkers(payload.queueId);
    } catch (error) {
      console.error('bad scheduler event', error);
    }
  });
  return client;
}
