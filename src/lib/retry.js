export function nextRunAt(policy, attemptCount) {
  const base = Number(policy?.base_delay_ms ?? 1000);
  const attempt = Math.max(1, Number(attemptCount || 1));
  const strategy = policy?.strategy || 'exponential';
  let delay = base;
  if (strategy === 'linear') delay = base * attempt;
  if (strategy === 'exponential') delay = base * 2 ** (attempt - 1);
  return new Date(Date.now() + delay);
}
