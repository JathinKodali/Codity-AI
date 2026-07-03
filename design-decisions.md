# Design Decisions

## Postgres Row Locks Instead Of Redis Or Kafka

The scheduler uses PostgreSQL as both system of record and coordination layer. The central claim operation is a single `UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *` query. That gives distributed locking via Postgres row-level locks: competing workers skip rows already locked by another transaction, so only one worker can claim a job while still keeping the query easy to inspect and test.

```sql
UPDATE jobs SET status='claimed', claimed_by=$1, claimed_at=now(), lock_version=lock_version+1
WHERE id = (
  SELECT id FROM jobs
  WHERE queue_id=$2 AND status='queued' AND run_at <= now()
  ORDER BY priority DESC, run_at ASC
  FOR UPDATE SKIP LOCKED LIMIT 1
) RETURNING *;
```

Redis or Kafka would make sense at higher throughput, but they add a second source of truth and more recovery logic. Here, durability, uniqueness, retries, DLQ, and audit history all remain in one transactional database.

## Retry And DLQ

Each queue owns one retry policy with `fixed`, `linear`, or `exponential` delay. A failed execution increments `attempt_count`; if attempts remain, the job is requeued with a future `run_at`. Once attempts are exhausted, it moves to `dead_letter_queue`. AI summaries are fire-and-forget, so a missing or failing LLM API never blocks DLQ durability.

## Indexes And Cascades

The critical dashboard and claim index is `jobs(queue_id, status, run_at)`. Foreign keys cascade from organizations through projects, queues, and jobs because those are ownership boundaries. User ownership is restricted to avoid deleting an owner accidentally erasing audit context.

## Realtime And Wakeups

The API and worker are separate processes, so status changes are bridged through Postgres `LISTEN/NOTIFY`. Immediate jobs also send wake notifications so idle workers can poll promptly instead of waiting for the next interval.

## Explicit Descopes

Queue sharding is not implemented. A production path would shard queues by organization or project, keep the same claim query per shard, and aggregate metrics asynchronously.

Workflow dependencies are not implemented in this build. The intended design is `job_dependencies(job_id, depends_on_job_id)` plus a pre-claim condition that rejects jobs with unfinished dependencies: `WHERE NOT EXISTS (...)`.
