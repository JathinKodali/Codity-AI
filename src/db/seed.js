import bcrypt from 'bcryptjs';
import { pool } from './pool.js';

const passwordHash = await bcrypt.hash('password123', 10);
const { rows: users } = await pool.query(
  `INSERT INTO users(email, password_hash, role)
   VALUES ('admin@scheduler.local', $1, 'admin')
   ON CONFLICT (email) DO UPDATE SET role='admin'
   RETURNING id`,
  [passwordHash]
);
const userId = users[0].id;
const { rows: orgs } = await pool.query(
  `INSERT INTO organizations(name, owner_id)
   VALUES ('Ops Lab', $1)
   ON CONFLICT DO NOTHING
   RETURNING id`,
  [userId]
);
let orgId = orgs[0]?.id;
if (!orgId) {
  orgId = (await pool.query(`SELECT id FROM organizations WHERE name='Ops Lab' LIMIT 1`)).rows[0].id;
}
const { rows: projects } = await pool.query(
  `INSERT INTO projects(org_id, name) VALUES ($1, 'Scheduler Demo') RETURNING id`,
  [orgId]
);
const projectId = projects[0].id;
const { rows: queues } = await pool.query(
  `INSERT INTO queues(project_id, name, priority, concurrency_limit)
   VALUES ($1, 'default', 10, 3) RETURNING id`,
  [projectId]
);
const queueId = queues[0].id;
await pool.query(
  `INSERT INTO retry_policies(queue_id, strategy, max_attempts, base_delay_ms)
   VALUES ($1, 'exponential', 3, 750)
   ON CONFLICT (queue_id) DO NOTHING`,
  [queueId]
);
for (let i = 0; i < 8; i += 1) {
  await pool.query(
    `INSERT INTO jobs(queue_id, type, payload, priority, run_at)
     VALUES ($1, 'immediate', $2, $3, now())`,
    [queueId, { demo: true, mode: i === 2 ? 'fail-once' : 'success', index: i }, i % 3]
  );
}
await pool.end();
console.log('seeded admin@scheduler.local / password123');
