export async function runHandler(job) {
  const payload = job.payload || {};
  const duration = Number(payload.duration_ms || payload.durationMs || 250);
  await new Promise((resolve) => setTimeout(resolve, duration));
  if (payload.mode === 'fail' || payload.fail === true) throw new Error(payload.error || 'simulated failure');
  if (payload.mode === 'timeout') {
    await new Promise((resolve) => setTimeout(resolve, Number(payload.timeout_ms || 35_000)));
  }
  if (payload.mode === 'fail-once' && Number(job.attempt_count) === 0) throw new Error('simulated first-attempt failure');
  return { ok: true, handledAt: new Date().toISOString(), echo: payload };
}
