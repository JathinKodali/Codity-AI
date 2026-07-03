DO $$ BEGIN CREATE TYPE user_role AS ENUM ('admin','member'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE queue_status AS ENUM ('active','paused'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE retry_strategy AS ENUM ('fixed','linear','exponential'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE job_type AS ENUM ('immediate','delayed','scheduled','recurring','batch'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE job_status AS ENUM ('queued','scheduled','claimed','running','completed','failed','dead'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE execution_result AS ENUM ('success','failure'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE worker_status AS ENUM ('idle','busy','dead'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organizations (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS organizations_owner_id_idx ON organizations(owner_id);

CREATE TABLE IF NOT EXISTS projects (
  id BIGSERIAL PRIMARY KEY,
  org_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS projects_org_id_idx ON projects(org_id);

CREATE TABLE IF NOT EXISTS queues (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  concurrency_limit INTEGER NOT NULL DEFAULT 1 CHECK (concurrency_limit > 0),
  status queue_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, name)
);
CREATE INDEX IF NOT EXISTS queues_project_id_idx ON queues(project_id);
CREATE INDEX IF NOT EXISTS queues_status_idx ON queues(status);

CREATE TABLE IF NOT EXISTS retry_policies (
  id BIGSERIAL PRIMARY KEY,
  queue_id BIGINT NOT NULL UNIQUE REFERENCES queues(id) ON DELETE CASCADE,
  strategy retry_strategy NOT NULL DEFAULT 'exponential',
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  base_delay_ms INTEGER NOT NULL DEFAULT 1000 CHECK (base_delay_ms >= 0)
);

CREATE TABLE IF NOT EXISTS jobs (
  id BIGSERIAL PRIMARY KEY,
  queue_id BIGINT NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
  type job_type NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status job_status NOT NULL DEFAULT 'queued',
  priority INTEGER NOT NULL DEFAULT 0,
  run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  claimed_by BIGINT,
  claimed_at TIMESTAMPTZ,
  lock_version INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jobs_queue_status_run_at_idx ON jobs (queue_id, status, run_at);
CREATE INDEX IF NOT EXISTS jobs_status_run_at_idx ON jobs(status, run_at);
CREATE INDEX IF NOT EXISTS jobs_claimed_by_idx ON jobs(claimed_by);

CREATE TABLE IF NOT EXISTS job_executions (
  id BIGSERIAL PRIMARY KEY,
  job_id BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  worker_id BIGINT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  result execution_result,
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS job_executions_job_id_idx ON job_executions(job_id);
CREATE INDEX IF NOT EXISTS job_executions_worker_id_idx ON job_executions(worker_id);

CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id BIGSERIAL PRIMARY KEY,
  queue_id BIGINT NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
  cron_expr TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  next_run_at TIMESTAMPTZ NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS scheduled_jobs_due_idx ON scheduled_jobs(active, next_run_at);

CREATE TABLE IF NOT EXISTS workers (
  id BIGSERIAL PRIMARY KEY,
  hostname TEXT NOT NULL,
  pid INTEGER NOT NULL,
  status worker_status NOT NULL DEFAULT 'idle',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS worker_heartbeats (
  id BIGSERIAL PRIMARY KEY,
  worker_id BIGINT NOT NULL UNIQUE REFERENCES workers(id) ON DELETE CASCADE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS worker_heartbeats_last_seen_at_idx ON worker_heartbeats(last_seen_at);

CREATE TABLE IF NOT EXISTS job_logs (
  id BIGSERIAL PRIMARY KEY,
  job_id BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS job_logs_job_id_idx ON job_logs(job_id);

CREATE TABLE IF NOT EXISTS dead_letter_queue (
  id BIGSERIAL PRIMARY KEY,
  job_id BIGINT NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
  final_error TEXT NOT NULL,
  ai_summary TEXT,
  moved_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION set_jobs_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS jobs_set_updated_at ON jobs;
CREATE TRIGGER jobs_set_updated_at BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION set_jobs_updated_at();
