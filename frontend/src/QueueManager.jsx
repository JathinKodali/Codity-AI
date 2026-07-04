import React, { useEffect, useState } from 'react';

export default function QueueManager({ api, overview, refresh }) {
  const [editing, setEditing] = useState(null);

  async function toggleQueue(queueId, currentStatus) {
    const action = currentStatus === 'active' ? 'pause' : 'resume';
    await api(`/api/queues/${queueId}/${action}`, { method: 'PATCH' });
    refresh();
  }

  async function updateQueue(queueId, updates) {
    await api(`/api/queues/${queueId}`, { method: 'PATCH', body: JSON.stringify(updates) });
    setEditing(null);
    refresh();
  }

  async function updateRetryPolicy(queueId, updates) {
    await api(`/api/retry-policies/${queueId}`, { method: 'PATCH', body: JSON.stringify(updates) });
    refresh();
  }

  const queueCounts = {};
  overview.queues.forEach(q => {
    const c = typeof q.counts === 'object' ? q.counts : {};
    queueCounts[q.id] = {
      total: Object.values(c).reduce((s, v) => s + Number(v), 0),
      completed: Number(c.completed || 0),
      dead: Number(c.dead || 0),
      active: Number(c.queued || 0) + Number(c.running || 0) + Number(c.claimed || 0)
    };
  });

  return (
    <div className="queue-config-grid anim-stagger">
      {overview.queues.map(queue => {
        const stats = queueCounts[queue.id] || {};
        const isEditing = editing === queue.id;
        return (
          <div className="card-white queue-card" key={queue.id}>
            <div className="queue-header">
              <span className="queue-name" style={{color: 'var(--text-dark)'}}>{queue.name}</span>
              <span className={`badge-soft badge-soft-${queue.status === 'active' ? 'completed' : 'dead'}`}>
                <span className="badge-dot" />
                {queue.status}
              </span>
            </div>

            <div className="queue-stats" style={{background: 'var(--bg-card-dark)', padding: '14px', borderRadius: '12px'}}>
              <span className="stat"><span className="n" style={{color:'var(--accent)'}}>{stats.total || 0}</span> jobs</span>
              <span style={{color: 'var(--border-dark)'}}>|</span>
              <span className="stat"><span className="n" style={{color:'var(--green)'}}>{stats.completed || 0}</span> done</span>
              <span style={{color: 'var(--border-dark)'}}>|</span>
              <span className="stat"><span className="n" style={{color:'var(--yellow)'}}>{stats.active || 0}</span> run</span>
              <span style={{color: 'var(--border-dark)'}}>|</span>
              <span className="stat"><span className="n" style={{color:'var(--red)'}}>{stats.dead || 0}</span> dead</span>
            </div>

            {isEditing ? (
              <QueueEditForm 
                queue={queue} 
                onSave={updateQueue} 
                onCancel={() => setEditing(null)} 
                onUpdatePolicy={updateRetryPolicy} 
              />
            ) : (
              <>
                <div style={{display:'flex',gap:12,fontSize:13,color:'var(--text-secondary)'}}>
                  <span>Priority: <strong style={{color:'var(--text-dark)'}}>{queue.priority}</strong></span>
                  <span>·</span>
                  <span>Concurrency Limit: <strong style={{color:'var(--text-dark)'}}>{queue.concurrency_limit}</strong></span>
                </div>
                <div style={{display:'flex',gap:8,marginTop:4}}>
                  <button className="btn-light btn-sm" onClick={() => setEditing(queue.id)}>⚙ Config</button>
                  <button 
                    className={`btn-light btn-sm`}
                    style={{
                      color: queue.status === 'active' ? 'var(--red)' : 'var(--green)',
                      background: queue.status === 'active' ? 'var(--red-soft)' : 'var(--green-soft)',
                      borderColor: 'transparent'
                    }}
                    onClick={() => toggleQueue(queue.id, queue.status)}
                  >
                    {queue.status === 'active' ? '⏸ Pause Queue' : '▶ Resume Queue'}
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })}
      {overview.queues.length === 0 && (
        <div className="card-white empty-state" style={{gridColumn: '1 / -1'}}>
          <div className="icon">📦</div>
          <p>No job queues configured</p>
        </div>
      )}
    </div>
  );
}

function QueueEditForm({ queue, onSave, onCancel, onUpdatePolicy }) {
  const [priority, setPriority] = useState(queue.priority);
  const [concurrency, setConcurrency] = useState(queue.concurrency_limit);
  const [strategy, setStrategy] = useState('exponential');
  const [maxAttempts, setMaxAttempts] = useState(3);
  const [baseDelay, setBaseDelay] = useState(1000);

  return (
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      <div className="config-row">
        <label>Priority</label>
        <input type="number" value={priority} onChange={e => setPriority(Number(e.target.value))} style={{width:100}} />
      </div>
      <div className="config-row">
        <label>Concurrency</label>
        <input type="number" min={1} value={concurrency} onChange={e => setConcurrency(Number(e.target.value))} style={{width:100}} />
      </div>
      
      <div style={{borderTop:'1px solid var(--border-light)',paddingTop:12,marginTop:4}}>
        <div style={{fontSize:11,color:'var(--text-secondary)',marginBottom:10,fontWeight:700,letterSpacing: '0.04em'}}>RETRY POLICY</div>
        <div className="config-row">
          <label>Backoff Mode</label>
          <select value={strategy} onChange={e => setStrategy(e.target.value)} style={{width:130}}>
            <option value="fixed">Fixed Delay</option>
            <option value="linear">Linear Backoff</option>
            <option value="exponential">Exponential</option>
          </select>
        </div>
        <div className="config-row" style={{marginTop:6}}>
          <label>Max Retries</label>
          <input type="number" min={1} value={maxAttempts} onChange={e => setMaxAttempts(Number(e.target.value))} style={{width:100}} />
        </div>
        <div className="config-row" style={{marginTop:6}}>
          <label>Base Delay</label>
          <input type="number" min={0} value={baseDelay} onChange={e => setBaseDelay(Number(e.target.value))} style={{width:100}} />
          <span style={{fontSize:11,color:'var(--text-muted)'}}>ms</span>
        </div>
      </div>

      <div style={{display:'flex',gap:8,marginTop:8}}>
        <button 
          className="btn-purple btn-sm" 
          onClick={() => {
            onSave(queue.id, { priority, concurrency_limit: concurrency });
            onUpdatePolicy(queue.id, { strategy, max_attempts: maxAttempts, base_delay_ms: baseDelay });
          }}
        >
          Save Settings
        </button>
        <button className="btn-light btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
