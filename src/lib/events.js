import { EventEmitter } from 'node:events';

export const bus = new EventEmitter();

export function emitJobChange(job) {
  bus.emit('job:updated', job);
}

export function emitWorkerChange(worker) {
  bus.emit('worker:status', worker);
}

export function wakeWorkers(queueId) {
  bus.emit('worker:wake', { queueId });
}
