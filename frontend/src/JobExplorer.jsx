import React, { useEffect, useState } from 'react';

export default function JobExplorer({ api, overview, flash }) {
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [jobData, setJobData] = useState({ rows: [], total: 0 });
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const limit = 20;

  async function fetchJobs() {
    const params = new URLSearchParams({ page, limit });
    if (filter !== 'all') params.set('status', filter);
    const data = await api(`/api/jobs?${params}`);
    setJobData(data);
  }

  useEffect(() => { fetchJobs().catch(console.error); }, [page, filter]);
  useEffect(() => { if (page === 1) fetchJobs().catch(console.error); }, [overview.jobs]);

  async function openDetail(jobId) {
    setLoading(true);
    try {
      const data = await api(`/api/jobs/${jobId}`);
      setDetail(data);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function retryJob(jobId) {
    await api(`/api/dlq/${jobId}/retry`, { method: 'POST' });
    setDetail(null);
    fetchJobs();
  }

  const totalPages = Math.ceil(jobData.total / limit);
  const statuses = ['all','queued','scheduled','claimed','running','completed','failed','dead'];

  return (
    <div className="card-white anim-stagger">
      {/* Pill Filters */}
      <div className="filter-tabs">
        {statuses.map(s => (
          <button
            key={s}
            className={`filter-tab-btn ${filter === s ? 'active' : ''}`}
            onClick={() => { setFilter(s); setPage(1); }}
          >
            <span className={`badge-dot`} style={{
              background: s === 'all' ? 'var(--text-muted)' : `var(--${s === 'failed' || s === 'dead' ? 'red' : s === 'completed' ? 'green' : s === 'running' || s === 'claimed' ? 'accent' : 'yellow'})`
            }} />
            {s === 'all' ? 'All Jobs' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      <div className="table-container">
        <table className="table-light">
          <thead>
            <tr>
              <th>ID</th>
              <th>Status</th>
              <th>Queue</th>
              <th>Type</th>
              <th>Priority</th>
              <th>Run At</th>
              <th>Attempts</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {jobData.rows.map(job => (
              <tr 
                key={job.id} 
                className={`${flash === job.id ? 'row-flash' : ''}`} 
                onClick={() => openDetail(job.id)}
              >
                <td className="mono" style={{fontWeight: 700}}>#{job.id}</td>
                <td>
                  <span className={`badge-soft badge-soft-${job.status}`}>
                    <span className="badge-dot" />
                    {job.status}
                  </span>
                </td>
                <td style={{fontWeight: 500}}>{job.queue_name}</td>
                <td className="mono" style={{color: 'var(--text-secondary)'}}>{job.type}</td>
                <td className="mono">{job.priority}</td>
                <td className="mono" style={{color: 'var(--text-secondary)'}}>{new Date(job.run_at).toLocaleTimeString()}</td>
                <td className="mono">{job.attempt_count}</td>
                <td className="mono" style={{color: 'var(--text-muted)'}}>{new Date(job.created_at).toLocaleString()}</td>
              </tr>
            ))}
            {jobData.rows.length === 0 && (
              <tr>
                <td colSpan={8}>
                  <div className="empty-state">
                    <div className="icon">📋</div>
                    <p>No jobs found in this state</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <span>{jobData.total} jobs found · Page {page} of {totalPages || 1}</span>
        <div className="page-btns">
          <button className="btn-light btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
          <button className="btn-light btn-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      </div>

      {detail && (
        <>
          <div className="overlay-container" onClick={() => setDetail(null)} />
          <div className="slide-panel">
            <button className="slide-panel-close" onClick={() => setDetail(null)}>✕</button>
            <div style={{display: 'flex', alignItems: 'center', gap: '12px', marginTop: '12px'}}>
              <h2>Job #{detail.id}</h2>
              <span className={`badge-soft badge-soft-${detail.status}`}>
                <span className="badge-dot" />
                {detail.status}
              </span>
            </div>

            <div className="detail-section">
              <h3>Configuration</h3>
              <div className="detail-grid">
                <div className="detail-field">
                  <div className="label">Queue</div>
                  <div className="val" style={{color: 'var(--text-dark)'}}>{detail.queue_name}</div>
                </div>
                <div className="detail-field">
                  <div className="label">Job Type</div>
                  <div className="val" style={{color: 'var(--text-dark)'}}>{detail.type}</div>
                </div>
                <div className="detail-field">
                  <div className="label">Priority</div>
                  <div className="val" style={{color: 'var(--text-dark)'}}>{detail.priority}</div>
                </div>
                <div className="detail-field">
                  <div className="label">Attempt Count</div>
                  <div className="val" style={{color: 'var(--text-dark)'}}>{detail.attempt_count}</div>
                </div>
                <div className="detail-field" style={{gridColumn: '1 / -1'}}>
                  <div className="label">Target Run At</div>
                  <div className="val" style={{color: 'var(--text-dark)'}}>{new Date(detail.run_at).toLocaleString()}</div>
                </div>
              </div>
            </div>

            <div className="detail-section">
              <h3>Payload Parameters</h3>
              <pre style={{
                background: 'var(--bg-card-dark)',
                border: '1px solid var(--border-light)',
                padding: '16px',
                borderRadius: '12px',
                fontSize: '12.5px',
                fontFamily: "'JetBrains Mono', monospace",
                overflow: 'auto',
                maxHeight: '180px',
                color: 'var(--text-dark)'
              }}>
                {JSON.stringify(detail.payload, null, 2)}
              </pre>
            </div>

            {detail.executions?.length > 0 && (
              <div className="detail-section">
                <h3>Execution Attempts</h3>
                <div className="table-container">
                  <table className="table-light" style={{fontSize: '12px'}}>
                    <thead>
                      <tr>
                        <th>Worker</th>
                        <th>Result</th>
                        <th>Started</th>
                        <th>Finished</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.executions.map(ex => (
                        <tr key={ex.id}>
                          <td className="mono" style={{fontWeight: 700}}>w{ex.worker_id}</td>
                          <td>
                            {ex.result ? (
                              <span className={`badge-soft badge-soft-${ex.result === 'success' ? 'completed' : 'dead'}`}>
                                <span className="badge-dot" />
                                {ex.result}
                              </span>
                            ) : 'In Progress'}
                          </td>
                          <td className="mono">{new Date(ex.started_at).toLocaleTimeString()}</td>
                          <td className="mono">{ex.finished_at ? new Date(ex.finished_at).toLocaleTimeString() : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {detail.logs?.length > 0 && (
              <div className="detail-section">
                <h3>Console Logs</h3>
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  background: 'var(--bg-card-dark)',
                  border: '1px solid var(--border-light)',
                  padding: '12px',
                  borderRadius: '12px',
                  maxHeight: '200px',
                  overflowY: 'auto'
                }}>
                  {detail.logs.map(log => (
                    <div className="log-entry" key={log.id} style={{border: 'none', padding: '4px 0'}}>
                      <span className={`log-level ${log.level}`} style={{fontSize: '11px'}}>[{log.level}]</span>
                      <span className="log-msg" style={{color: 'var(--text-dark)'}}>{log.message}</span>
                      <span className="log-time" style={{fontSize: '10px'}}>{new Date(log.created_at).toLocaleTimeString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {detail.status === 'dead' && (
              <div style={{marginTop: 'auto', paddingTop: '16px'}}>
                <button 
                  className="btn-purple" 
                  onClick={() => retryJob(detail.id)}
                  style={{
                    width: '100%',
                    padding: '14px',
                    borderRadius: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: 'none',
                    textAlign: 'center'
                  }}
                >
                  ↻ Requeue Job to Scheduler
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
