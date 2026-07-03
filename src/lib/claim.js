export const claimSql = `
UPDATE jobs SET status='claimed', claimed_by=$1, claimed_at=now(), lock_version=lock_version+1
WHERE id = (
  SELECT j.id FROM jobs j
  JOIN queues q ON q.id = j.queue_id
  WHERE j.queue_id=$2 AND j.status='queued' AND j.run_at <= now() AND q.status='active'
  ORDER BY j.priority DESC, j.run_at ASC
  FOR UPDATE OF j SKIP LOCKED LIMIT 1
) RETURNING *;`;
