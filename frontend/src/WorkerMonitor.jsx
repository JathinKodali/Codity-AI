import React from 'react';

export default function WorkerMonitor({ overview }) {
  const workers = overview.workers || [];
  const active = workers.filter(w => w.status !== 'dead').length;
  const dead = workers.filter(w => w.status === 'dead').length;
  const busy = workers.filter(w => w.status === 'busy').length;

  return (
    <div className="content-grid anim-stagger">
      {/* Worker Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', gridColumn: '1 / -1', marginBottom: '8px' }}>
        <div className="metric-card-white">
          <div className="metric-icon-wrapper" style={{background: 'var(--green-soft)', color: 'var(--green)'}}>✓</div>
          <div className="val">{active}</div>
          <div className="lbl">Active Workers</div>
        </div>
        <div className="metric-card-white">
          <div className="metric-icon-wrapper" style={{background: 'var(--yellow-soft)', color: 'var(--yellow)'}}>⧖</div>
          <div className="val">{busy}</div>
          <div className="lbl">Busy Workers</div>
        </div>
        <div className="metric-card-white">
          <div className="metric-icon-wrapper" style={{background: 'var(--red-soft)', color: 'var(--red)'}}>✕</div>
          <div className="val">{dead}</div>
          <div className="lbl">Dead Workers</div>
        </div>
        <div className="metric-card-white">
          <div className="metric-icon-wrapper" style={{background: 'var(--accent-soft)', color: 'var(--accent)'}}>⚙</div>
          <div className="val">{workers.length}</div>
          <div className="lbl">Total Registered</div>
        </div>
      </div>

      {/* Grid of worker status cards */}
      <div className="worker-grid" style={{gridColumn: '1 / -1'}}>
        {workers.map(worker => {
          const lastSeen = worker.last_seen_at ? new Date(worker.last_seen_at) : null;
          const ago = lastSeen ? Math.round((Date.now() - lastSeen.getTime()) / 1000) : null;
          const startedAt = new Date(worker.started_at);
          const uptimeMin = Math.round((Date.now() - startedAt.getTime()) / 60000);

          return (
            <div className="card-white worker-card" key={worker.id}>
              <div className="worker-header">
                <span className="worker-id" style={{color: 'var(--text-dark)'}}>Worker #{worker.id}</span>
                <span className={`badge-soft badge-soft-${worker.status === 'dead' ? 'dead' : worker.status === 'busy' ? 'failed' : 'completed'}`}>
                  <span className="badge-dot" />
                  {worker.status}
                </span>
              </div>
              
              <div style={{display: 'flex', flexDirection: 'column', gap: '8px', background: 'var(--bg-card-dark)', padding: '16px', borderRadius: '12px', marginTop: '4px'}}>
                <div className="worker-detail" style={{color: 'var(--text-secondary)'}}>
                  <span>🖥 Host: <strong style={{color: 'var(--text-dark)'}}>{worker.hostname}</strong></span>
                  <span>PID: <strong style={{color: 'var(--text-dark)'}}>{worker.pid}</strong></span>
                </div>
                <div className="worker-detail" style={{color: 'var(--text-secondary)'}}>
                  <span>⏱ Started: <strong style={{color: 'var(--text-dark)'}}>{startedAt.toLocaleTimeString()}</strong></span>
                  <span>Uptime: <strong style={{color: 'var(--text-dark)'}}>{uptimeMin} min</strong></span>
                </div>
              </div>

              <div className="worker-detail" style={{justifyContent: 'space-between', alignItems: 'center', marginTop: '4px'}}>
                <span style={{color: 'var(--text-muted)'}}>💓 Last Seen: {lastSeen ? `${ago}s ago` : 'No heartbeat'}</span>
                {lastSeen && (
                  <span className={`badge-soft badge-soft-${ago > 15 ? 'dead' : ago > 5 ? 'failed' : 'completed'}`} style={{fontSize: '10.5px', padding: '3px 8px'}}>
                    {ago > 15 ? '● Stale' : ago > 5 ? '● Slow' : '● Healthy'}
                  </span>
                )}
              </div>
            </div>
          );
        })}
        {workers.length === 0 && (
          <div className="card-white empty-state" style={{gridColumn: '1 / -1'}}>
            <div className="icon">🔧</div>
            <p>No distributed workers are currently connected</p>
          </div>
        )}
      </div>
    </div>
  );
}
