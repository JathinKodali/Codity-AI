import React, { useEffect, useState, useRef } from 'react';

/* Animated counter hook */
function useAnimatedValue(target, duration = 600) {
  const [value, setValue] = useState(0);
  const rafRef = useRef(null);
  useEffect(() => {
    const start = value;
    const diff = target - start;
    if (diff === 0) return;
    const startTime = performance.now();
    function step(now) {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(start + diff * eased));
      if (progress < 1) rafRef.current = requestAnimationFrame(step);
    }
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target]);
  return value;
}

function AnimatedNumber({ value }) {
  const aVal = useAnimatedValue(value);
  return <>{aVal}</>;
}

function relativeTime(dateStr) {
  const seconds = Math.round((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

export default function Dashboard({ api, overview }) {
  const [metrics, setMetrics] = useState(null);

  useEffect(() => {
    api('/api/metrics').then(setMetrics).catch(console.error);
    const t = setInterval(() => api('/api/metrics').then(setMetrics).catch(console.error), 8000);
    return () => clearInterval(t);
  }, []);

  const counts = Object.fromEntries((overview.counts || []).map(r => [r.status, r.count]));
  const completed = Number(counts.completed || 0);
  const failed = Number(counts.failed || 0) + Number(counts.dead || 0);
  const running = Number(counts.running || 0) + Number(counts.claimed || 0);
  const queued = Number(counts.queued || 0) + Number(counts.scheduled || 0);
  const total = Object.values(counts).reduce((s, v) => s + Number(v), 0);
  const failRate = total ? Math.round((failed / total) * 100) : 0;
  const activeWorkers = overview.workers.filter(w => w.status !== 'dead').length;



  const queueStats = metrics?.queueStats || [];
  const maxJobs = Math.max(1, ...queueStats.map(q => q.total_jobs));

  const statusEntries = Object.entries(counts);
  const maxStatus = Math.max(1, ...statusEntries.map(([,c]) => Number(c)));

  const recentJobs = [...overview.jobs]
    .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
    .slice(0, 10);

  return (
    <div className="content-grid anim-stagger">
      {/* Metrics Row (placed as white stats card below banner) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', gridColumn: '1 / -1', marginBottom: '8px' }}>
        <div className="metric-card-white">
          <div className="metric-icon-wrapper" style={{background: 'var(--accent-soft)', color: 'var(--accent)'}}>⊞</div>
          <div className="val"><AnimatedNumber value={total} /></div>
          <div className="lbl">Total Jobs</div>
          <div className="sub-lbl">{queued} queued</div>
        </div>
        <div className="metric-card-white">
          <div className="metric-icon-wrapper" style={{background: 'var(--green-soft)', color: 'var(--green)'}}>✓</div>
          <div className="val"><AnimatedNumber value={completed} /></div>
          <div className="lbl">Completed</div>
          <div className="sub-lbl">{running} running</div>
        </div>
        <div className="metric-card-white">
          <div className="metric-icon-wrapper" style={{background: 'var(--red-soft)', color: 'var(--red)'}}>⚠</div>
          <div className="val"><AnimatedNumber value={failRate} />%</div>
          <div className="lbl">Failure Rate</div>
          <div className="sub-lbl">{failed} dead/failed</div>
        </div>
        <div className="metric-card-white">
          <div className="metric-icon-wrapper" style={{background: 'var(--purple-soft)', color: 'var(--purple)'}}>✕</div>
          <div className="val"><AnimatedNumber value={overview.dlqCount} /></div>
          <div className="lbl">DLQ Size</div>
          <div className="sub-lbl">jobs in DLQ</div>
        </div>
        <div className="metric-card-white">
          <div className="metric-icon-wrapper" style={{background: 'var(--cyan-soft)', color: 'var(--cyan)'}}>⚡</div>
          <div className="val"><AnimatedNumber value={activeWorkers} /></div>
          <div className="lbl">Active Workers</div>
          <div className="sub-lbl">{overview.workers.length} total</div>
        </div>
        <div className="metric-card-white">
          <div className="metric-icon-wrapper" style={{background: 'var(--orange-soft)', color: 'var(--orange)'}}>⏱</div>
          <div className="val"><AnimatedNumber value={metrics?.avgDurationMs || 0} /><span style={{fontSize: '16px', fontWeight: '600', marginLeft: '4px'}}>ms</span></div>
          <div className="lbl">Avg Duration</div>
          <div className="sub-lbl">execution speed</div>
        </div>
      </div>

      {/* Split Cards for charts */}
      <div className="split-cards" style={{ gridColumn: '1 / -1' }}>
        <div className="card-white">
          <div className="card-title">Queue Breakdown</div>
          <div className="chart-bars">
            {queueStats.map(q => (
              <div key={q.id} className="chart-bar-col">
                <div 
                  className="chart-bar-fill" 
                  style={{
                    height: `${Math.max(12, (q.total_jobs / maxJobs) * 100)}%`,
                    background: 'linear-gradient(to top, var(--accent), var(--cyan))'
                  }}
                >
                  <div className="chart-bar-tooltip">{q.name}: {q.total_jobs} jobs</div>
                </div>
                <div style={{fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600}}>{q.name}</div>
              </div>
            ))}
            {queueStats.length === 0 && (
              <div style={{color:'var(--text-muted)',fontSize:14,padding:24,width:'100%',textAlign:'center', fontWeight: 500}}>No queue data yet</div>
            )}
          </div>
        </div>

        <div className="card-white">
          <div className="card-title">Status Distribution</div>
          <div className="chart-bars">
            {statusEntries.map(([status, count]) => {
              const colors = {
                queued:'var(--yellow)', scheduled:'var(--cyan)', claimed:'var(--purple)',
                running:'var(--accent)', completed:'var(--green)', failed:'var(--orange)', dead:'var(--red)'
              };
              return (
                <div key={status} className="chart-bar-col">
                  <div 
                    className="chart-bar-fill" 
                    style={{
                      height: `${Math.max(12, (Number(count) / maxStatus) * 100)}%`,
                      background: colors[status] || 'var(--text-muted)'
                    }}
                  >
                    <div className="chart-bar-tooltip">{status}: {count}</div>
                  </div>
                  <div style={{fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'capitalize'}}>{status}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recent Activity Card as a clean Table */}
      <div className="card-white" style={{ gridColumn: '1 / -1' }}>
        <div className="card-title" style={{marginBottom: '16px'}}>Recent Activity</div>
        <div className="table-container" style={{ border: 'none' }}>
          <table className="table-light">
            <thead>
              <tr>
                <th>Job ID</th>
                <th>Time</th>
                <th>Status</th>
                <th>Queue</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              {recentJobs.map(job => (
                <tr key={job.id}>
                   <td className="mono" style={{fontWeight: 700}}>#{job.id}</td>
                  <td className="mono" style={{color: 'var(--text-secondary)'}} title={new Date(job.updated_at || job.created_at).toLocaleString()}>
                    {relativeTime(job.updated_at || job.created_at)}
                  </td>
                  <td>
                    <span className={`badge-soft badge-soft-${job.status}`}>
                      <span className="badge-dot" />
                      {job.status}
                    </span>
                  </td>
                  <td style={{fontWeight: 500}}>{job.queue_name}</td>
                  <td className="mono" style={{color: 'var(--text-secondary)'}}>{job.type}</td>
                </tr>
              ))}
              {recentJobs.length === 0 && (
                <tr>
                   <td colSpan="5">
                    <div className="empty-state">
                      <p>No recent activity</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
