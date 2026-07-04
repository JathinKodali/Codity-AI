import React, { useEffect, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';
import Dashboard from './Dashboard.jsx';
import JobExplorer from './JobExplorer.jsx';
import QueueManager from './QueueManager.jsx';
import WorkerMonitor from './WorkerMonitor.jsx';
import DLQView from './DLQView.jsx';
import './styles.css';

const API = '';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'jobs',      label: 'Jobs',      icon: '📋' },
  { id: 'queues',    label: 'Queues',    icon: '📦' },
  { id: 'workers',   label: 'Workers',   icon: '🔧' },
  { id: 'dlq',       label: 'Dead Letter', icon: '💀' },
];

/* ── Toast System ── */
let toastId = 0;
function useToasts() {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, type = 'info') => {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, leaving: true } : t));
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 300);
    }, 2800);
  }, []);
  return { toasts, push };
}

function App() {
  const [token, setToken] = useState(localStorage.getItem('scheduler_token') || '');
  const [email, setEmail] = useState('admin@scheduler.local');
  const [password, setPassword] = useState('password123');
  const [tab, setTab] = useState('dashboard');
  const [overview, setOverview] = useState({ queues: [], jobs: [], workers: [], counts: [], dlqCount: 0 });
  const [flash, setFlash] = useState(null);
  const [loginError, setLoginError] = useState('');
  const [connected, setConnected] = useState(false);
  const { toasts, push: showToast } = useToasts();

  async function apiFn(path, options = {}) {
    const res = await fetch(`${API}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) }
    });
    if (!res.ok) {
      if (res.status === 401) logout();
      throw new Error(await res.text());
    }
    return res.json();
  }

  async function login(event) {
    event?.preventDefault();
    setLoginError('');
    try {
      const data = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      }).then(r => r.json());
      if (data.error) { setLoginError(data.error); return; }
      localStorage.setItem('scheduler_token', data.token);
      setToken(data.token);
    } catch (e) { setLoginError('Connection failed'); }
  }

  function logout() {
    localStorage.removeItem('scheduler_token');
    setToken('');
  }

  async function refresh() {
    if (!token) return;
    try { setOverview(await apiFn('/api/overview')); } catch (e) {
      if (e.message?.includes('401')) logout();
    }
  }

  async function createDemoJob(mode = 'success') {
    const queue = overview.queues[0];
    if (!queue) return;
    const dynamicPriority = Math.floor(Math.random() * 10) + 1;
    await apiFn('/api/jobs', {
      method: 'POST',
      body: JSON.stringify({
        queue_id: queue.id,
        type: 'immediate',
        payload: { mode, duration_ms: 900 },
        priority: dynamicPriority
      })
    });
    showToast(mode === 'fail' ? `Failing job (priority ${dynamicPriority}) dispatched` : `Success job (priority ${dynamicPriority}) dispatched`, mode === 'fail' ? 'error' : 'success');
    await refresh();
  }

  useEffect(() => { refresh(); }, [token]);
  useEffect(() => {
    if (!token) return;
    const socket = io(API, { transports: ['websocket'] });
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('job:updated', (job) => {
      setFlash(job.id);
      setOverview(old => ({
        ...old,
        jobs: [job, ...old.jobs.filter(j => j.id !== job.id)].slice(0, 100)
      }));
      setTimeout(() => setFlash(null), 800);
    });
    socket.on('worker:status', (worker) => {
      setOverview(old => ({ ...old, workers: [worker, ...old.workers.filter(w => w.id !== worker.id)] }));
    });
    return () => socket.disconnect();
  }, [token]);

  /* Escape key closes overlays */
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') document.querySelector('.slide-panel-close')?.click(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  /* Mousemove tracking for interactive liquid halo background */
  useEffect(() => {
    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let targetX = mouseX;
    let targetY = mouseY;
    let rafId = null;

    const handleMouseMove = (e) => {
      targetX = e.clientX;
      targetY = e.clientY;
    };

    const updatePosition = () => {
      const dx = targetX - mouseX;
      const dy = targetY - mouseY;
      
      if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
        mouseX += dx * 0.12;
        mouseY += dy * 0.12;

        const elements = document.getElementsByClassName('blob-pointer');
        for (let i = 0; i < elements.length; i++) {
          elements[i].style.transform = `translate3d(${mouseX - 225}px, ${mouseY - 225}px, 0)`;
        }
      }

      rafId = requestAnimationFrame(updatePosition);
    };

    window.addEventListener('mousemove', handleMouseMove);
    rafId = requestAnimationFrame(updatePosition);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  if (!token) {
    return (
      <div className="login-screen">
        {/* Background blobs in login screen too */}
        <div className="liquid-blur-bg">
          <div className="blob blob-purple"></div>
          <div className="blob blob-blue"></div>
          <div className="blob blob-cyan"></div>
          <div className="blob blob-pointer"></div>
        </div>
        <form className="login-card" onSubmit={login}>
          <div style={{ textAlign: 'center', marginBottom: '8px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <div className="banner-logo-icon-glass" style={{ width: '48px', height: '48px', fontSize: '24px', borderRadius: '14px', background: 'var(--accent)', display: 'grid', placeItems: 'center', color: 'white', boxShadow: '0 4px 15px var(--accent-glow)' }}>⚡</div>
            </div>
            <h1 style={{ color: 'var(--text-dark)', fontWeight: 800, letterSpacing: '-0.04em' }}>Scheduler Console</h1>
            <p className="sub">Enter credentials to monitor system state</p>
          </div>
          <div className="form-group">
            <label>Email</label>
            <input placeholder="admin@scheduler.local" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input placeholder="••••••••" type="password" value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          {loginError && <p style={{ color: 'var(--red)', fontSize: '13px', textAlign: 'center' }}>{loginError}</p>}
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '12px', marginTop: '10px' }}>Sign In</button>
        </form>
      </div>
    );
  }

  // Find page display details based on current tab
  const activeTabDetails = TABS.find(t => t.id === tab);

  return (
    <div className="app-container">
      {/* Background blobs for liquid glassmorphism */}
      <div className="liquid-blur-bg">
        <div className="blob blob-purple"></div>
        <div className="blob blob-blue"></div>
        <div className="blob blob-cyan"></div>
        <div className="blob blob-pointer"></div>
      </div>

      {/* Toast Notifications */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type} ${t.leaving ? 'leaving' : ''}`}>
            <span>{t.type === 'success' ? '✓' : t.type === 'error' ? '✕' : 'ℹ'}</span>
            {t.message}
          </div>
        ))}
      </div>

      {/* Top Banner (Header) */}
      <header className="top-banner">
        <div className="banner-header">
          <nav className="banner-nav">
            {TABS.map(t => (
              <button
                key={t.id}
                className={`banner-nav-btn ${tab === t.id ? 'active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <div className="banner-actions">
            <div className={`connection-dot ${connected ? '' : 'disconnected'}`} title={connected ? 'WebSocket connected' : 'WebSocket disconnected'} />
            <div className="banner-action-icon" title="Logout" onClick={logout}>🚪</div>
            <div className="banner-avatar" title={email}>
              {email.slice(0, 2).toUpperCase()}
            </div>
          </div>
        </div>

        <div className="banner-title-row">
          <div>
            <h1 style={{ color: 'white' }}>{activeTabDetails ? activeTabDetails.label : 'Operations'}</h1>
            <p style={{ color: 'var(--text-white-muted)', fontSize: '14px', marginTop: '4px' }}>
              Logged in as {email}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn-purple" onClick={() => createDemoJob('success')}>
              <span>+</span> Success Job
            </button>
            <button className="btn-light" style={{color: 'var(--text-dark)'}} onClick={() => createDemoJob('fail')}>
              <span>+</span> Failing Job
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="anim-fade-in" key={tab}>
        {tab === 'dashboard' && <Dashboard api={apiFn} overview={overview} />}
        {tab === 'jobs'      && <JobExplorer api={apiFn} overview={overview} flash={flash} />}
        {tab === 'queues'    && <QueueManager api={apiFn} overview={overview} refresh={refresh} />}
        {tab === 'workers'   && <WorkerMonitor overview={overview} />}
        {tab === 'dlq'       && <DLQView api={apiFn} />}
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
