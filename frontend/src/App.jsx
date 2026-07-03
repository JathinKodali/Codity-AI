import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';
import './styles.css';

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:4000';
const statusColor = {
  queued: '#d7b85f',
  scheduled: '#7aa7d9',
  claimed: '#a98fe8',
  running: '#45c4b0',
  completed: '#74c476',
  failed: '#f07c64',
  dead: '#d9485f'
};

function Badge({ status }) {
  return <span className="badge" style={{ '--status': statusColor[status] || '#8d97a5' }}>{status}</span>;
}

function App() {
  const [token, setToken] = useState(localStorage.getItem('scheduler_token') || '');
  const [email, setEmail] = useState('admin@scheduler.local');
  const [password, setPassword] = useState('password123');
  const [overview, setOverview] = useState({ queues: [], jobs: [], workers: [], counts: [], dlqCount: 0 });
  const [filter, setFilter] = useState('all');
  const [flash, setFlash] = useState(null);

  async function api(path, options = {}) {
    const res = await fetch(`${API}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) }
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async function login(event) {
    event?.preventDefault();
    const data = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    }).then((res) => res.json());
    localStorage.setItem('scheduler_token', data.token);
    setToken(data.token);
  }

  async function refresh() {
    if (!token) return;
    setOverview(await api('/api/overview'));
  }

  async function createDemoJob(mode = 'success') {
    const queue = overview.queues[0];
    if (!queue) return;
    await api('/api/jobs', {
      method: 'POST',
      body: JSON.stringify({ queue_id: queue.id, type: 'immediate', payload: { mode, duration_ms: 900 }, priority: mode === 'fail' ? 9 : 2 })
    });
    await refresh();
  }

  useEffect(() => { refresh().catch(console.error); }, [token]);
  useEffect(() => {
    if (!token) return undefined;
    const socket = io(API, { transports: ['websocket'] });
    socket.on('job:updated', (job) => {
      setFlash(job.id);
      setOverview((old) => ({
        ...old,
        jobs: [job, ...old.jobs.filter((item) => item.id !== job.id)].slice(0, 100)
      }));
      setTimeout(() => setFlash(null), 600);
      refresh().catch(console.error);
    });
    socket.on('worker:status', (worker) => {
      setOverview((old) => ({ ...old, workers: [worker, ...old.workers.filter((item) => item.id !== worker.id)] }));
    });
    return () => socket.disconnect();
  }, [token]);

  const jobs = useMemo(() => overview.jobs.filter((job) => filter === 'all' || job.status === filter), [overview.jobs, filter]);
  const counts = Object.fromEntries(overview.counts.map((row) => [row.status, row.count]));
  const completed = Number(counts.completed || 0);
  const failed = Number(counts.failed || 0) + Number(counts.dead || 0);
  const total = Object.values(counts).reduce((sum, value) => sum + Number(value), 0);

  if (!token) {
    return (
      <main className="login">
        <form onSubmit={login} className="console-panel">
          <p className="kicker">Scheduler Ops Console</p>
          <h1>Authenticate</h1>
          <input value={email} onChange={(e) => setEmail(e.target.value)} />
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" />
          <button>Open Console</button>
        </form>
      </main>
    );
  }

  return (
    <main className="app">
      <header className="topline">
        <div>
          <p className="kicker">distributed scheduler</p>
          <h1>Live Queue Operations</h1>
        </div>
        <div className="actions">
          <button onClick={() => createDemoJob('success')}>+ success job</button>
          <button onClick={() => createDemoJob('fail')}>+ failing job</button>
          <button onClick={refresh}>sync</button>
        </div>
      </header>

      <section className="metrics">
        <div><span>throughput</span><strong>{completed}</strong></div>
        <div><span>failure rate</span><strong>{total ? Math.round((failed / total) * 100) : 0}%</strong></div>
        <div><span>dlq</span><strong>{overview.dlqCount}</strong></div>
        <div><span>workers</span><strong>{overview.workers.length}</strong></div>
      </section>

      <section className="workspace">
        <aside className="queues">
          <h2>Queues</h2>
          {overview.queues.map((queue) => (
            <button className="queue-row" key={queue.id}>
              <span>{queue.name}</span>
              <small>p{queue.priority} / c{queue.concurrency_limit}</small>
              <Badge status={queue.status} />
            </button>
          ))}
        </aside>

        <section className="jobs">
          <div className="section-head">
            <h2>Jobs</h2>
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              {['all', ...Object.keys(statusColor)].map((status) => <option key={status}>{status}</option>)}
            </select>
          </div>
          <div className="table">
            <div className="thead"><span>id</span><span>status</span><span>queue</span><span>type</span><span>run at</span><span>attempt</span></div>
            {jobs.map((job) => (
              <div className={`tr ${flash === job.id ? 'flash' : ''}`} key={job.id}>
                <span>#{job.id}</span><Badge status={job.status} /><span>{job.queue_name || job.queue_id}</span><span>{job.type}</span><span>{new Date(job.run_at).toLocaleTimeString()}</span><span>{job.attempt_count}</span>
              </div>
            ))}
          </div>
        </section>

        <aside className="workers">
          <h2>Workers</h2>
          {overview.workers.map((worker) => (
            <div className="worker" key={worker.id}>
              <Badge status={worker.status} />
              <strong>w{worker.id}</strong>
              <span>{worker.hostname}</span>
              <time>{worker.last_seen_at ? new Date(worker.last_seen_at).toLocaleTimeString() : 'no heartbeat'}</time>
            </div>
          ))}
        </aside>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
