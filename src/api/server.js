import 'dotenv/config';
import http from 'node:http';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { Server } from 'socket.io';
import cron from 'node-cron';
import bcrypt from 'bcryptjs';
import { query } from '../db/pool.js';
import { requireAuth, requireRole, signToken } from '../lib/auth.js';
import { bus, emitJobChange, wakeWorkers } from '../lib/events.js';
import { claimSql } from '../lib/claim.js';
import { notifyJob, notifyWake, startDbEventListener } from '../lib/dbEvents.js';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.FRONTEND_ORIGIN || '*' }
});
const writeLimiter = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false });

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || '*' }));
app.use(express.json({ limit: '1mb' }));

bus.on('job:updated', (job) => io.emit('job:updated', job));
bus.on('worker:status', (worker) => io.emit('worker:status', worker));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/auth/register', writeLimiter, async (req, res) => {
  const { email, password, role = 'member' } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  const passwordHash = await bcrypt.hash(password, 10);
  const { rows } = await query(
    `INSERT INTO users(email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role`,
    [email, passwordHash, role]
  );
  res.status(201).json({ token: signToken(rows[0]), user: rows[0] });
});

app.post('/auth/login', writeLimiter, async (req, res) => {
  const { email, password } = req.body;
  const { rows } = await query(`SELECT id, email, password_hash, role FROM users WHERE email=$1`, [email]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password || '', user.password_hash))) {
    return res.status(401).json({ error: 'invalid credentials' });
  }
  res.json({ token: signToken(user), user: { id: user.id, email: user.email, role: user.role } });
});

app.use('/api', requireAuth);

app.get('/api/overview', async (_req, res) => {
  const [queues, jobs, workers, dlq] = await Promise.all([
    query(`SELECT q.*,
             COALESCE(jsonb_object_agg(c.status, c.count) FILTER (WHERE c.status IS NOT NULL), '{}'::jsonb) AS counts
           FROM queues q
           LEFT JOIN (SELECT queue_id, status::text, count(*)::int FROM jobs GROUP BY queue_id, status) c ON c.queue_id=q.id
           GROUP BY q.id
           ORDER BY q.priority DESC, q.name`),
    query(`SELECT j.*, q.name AS queue_name FROM jobs j JOIN queues q ON q.id=j.queue_id ORDER BY j.created_at DESC LIMIT 100`),
    query(`SELECT w.*, h.last_seen_at FROM workers w LEFT JOIN worker_heartbeats h ON h.worker_id=w.id ORDER BY w.started_at DESC LIMIT 50`),
    query(`SELECT count(*)::int AS count FROM dead_letter_queue`)
  ]);
  const counts = await query(`SELECT status, count(*)::int FROM jobs GROUP BY status`);
  res.json({ queues: queues.rows, jobs: jobs.rows, workers: workers.rows, counts: counts.rows, dlqCount: dlq.rows[0].count });
});

app.post('/api/organizations', writeLimiter, requireRole('admin'), async (req, res) => {
  const { rows } = await query(`INSERT INTO organizations(name, owner_id) VALUES ($1, $2) RETURNING *`, [req.body.name, req.user.sub]);
  res.status(201).json(rows[0]);
});

app.post('/api/projects', writeLimiter, requireRole('admin'), async (req, res) => {
  const { rows } = await query(`INSERT INTO projects(org_id, name) VALUES ($1, $2) RETURNING *`, [req.body.org_id, req.body.name]);
  res.status(201).json(rows[0]);
});

app.get('/api/projects', async (_req, res) => {
  const { rows } = await query(`SELECT * FROM projects ORDER BY created_at DESC`);
  res.json(rows);
});

app.post('/api/queues', writeLimiter, requireRole('admin'), async (req, res) => {
  const { project_id, name, priority = 0, concurrency_limit = 1 } = req.body;
  const { rows } = await query(
    `INSERT INTO queues(project_id, name, priority, concurrency_limit) VALUES ($1,$2,$3,$4) RETURNING *`,
    [project_id, name, priority, concurrency_limit]
  );
  await query(`INSERT INTO retry_policies(queue_id) VALUES ($1) ON CONFLICT DO NOTHING`, [rows[0].id]);
  res.status(201).json(rows[0]);
});

app.get('/api/queues', async (_req, res) => {
  const { rows } = await query(`SELECT * FROM queues ORDER BY priority DESC, name`);
  res.json(rows);
});

app.patch('/api/queues/:id/:action(pause|resume)', writeLimiter, requireRole('admin'), async (req, res) => {
  const status = req.params.action === 'pause' ? 'paused' : 'active';
  const { rows } = await query(`UPDATE queues SET status=$1 WHERE id=$2 RETURNING *`, [status, req.params.id]);
  res.json(rows[0]);
});

app.post('/api/jobs', writeLimiter, async (req, res) => {
  const { queue_id, type = 'immediate', payload = {}, priority = 0, run_at, cron_expr } = req.body;
  if (type === 'recurring') {
    const nextRunAt = run_at ? new Date(run_at) : new Date();
    const { rows } = await query(
      `INSERT INTO scheduled_jobs(queue_id, cron_expr, payload, next_run_at) VALUES ($1,$2,$3,$4) RETURNING *`,
      [queue_id, cron_expr || '* * * * *', payload, nextRunAt]
    );
    return res.status(201).json(rows[0]);
  }
  const scheduled = type === 'scheduled' || type === 'delayed';
  const jobRunAt = run_at ? new Date(run_at) : new Date();
  const { rows } = await query(
    `INSERT INTO jobs(queue_id, type, payload, status, priority, run_at)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [queue_id, type, payload, scheduled && jobRunAt > new Date() ? 'scheduled' : 'queued', priority, jobRunAt]
  );
  if (jobRunAt <= new Date()) {
    wakeWorkers(queue_id);
    await notifyWake(queue_id);
  }
  emitJobChange(rows[0]);
  await notifyJob(rows[0]);
  res.status(201).json(rows[0]);
});

app.get('/api/jobs', async (req, res) => {
  const clauses = [];
  const params = [];
  if (req.query.status) { params.push(req.query.status); clauses.push(`j.status=$${params.length}`); }
  if (req.query.queue_id) { params.push(req.query.queue_id); clauses.push(`j.queue_id=$${params.length}`); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { rows } = await query(`SELECT j.*, q.name AS queue_name FROM jobs j JOIN queues q ON q.id=j.queue_id ${where} ORDER BY j.run_at DESC LIMIT 200`, params);
  res.json(rows);
});

app.post('/api/admin/claim/:queueId', writeLimiter, requireRole('admin'), async (req, res) => {
  const workerId = req.body.worker_id || 0;
  const { rows } = await query(claimSql, [workerId, req.params.queueId]);
  res.json(rows[0] || null);
});

cron.schedule('* * * * * *', async () => {
  const due = await query(`UPDATE jobs SET status='queued' WHERE status='scheduled' AND run_at <= now() RETURNING *`);
  for (const job of due.rows) {
    emitJobChange(job);
    wakeWorkers(job.queue_id);
    await notifyJob(job);
    await notifyWake(job.queue_id);
  }
  const recurring = await query(`SELECT * FROM scheduled_jobs WHERE active=true AND next_run_at <= now() LIMIT 25`);
  for (const scheduled of recurring.rows) {
    const job = await query(
      `INSERT INTO jobs(queue_id, type, payload, status, run_at) VALUES ($1,'recurring',$2,'queued',now()) RETURNING *`,
      [scheduled.queue_id, scheduled.payload]
    );
    await query(`UPDATE scheduled_jobs SET next_run_at=now() + interval '1 minute' WHERE id=$1`, [scheduled.id]);
    emitJobChange(job.rows[0]);
    wakeWorkers(scheduled.queue_id);
    await notifyJob(job.rows[0]);
    await notifyWake(scheduled.queue_id);
  }
});

const port = Number(process.env.PORT || 4000);
await startDbEventListener();
server.listen(port, () => console.log(`api listening on ${port}`));
