import React, { useEffect, useState } from 'react';

export default function DLQView({ api }) {
  const [entries, setEntries] = useState([]);
  const [retrying, setRetrying] = useState(null);

  async function fetchDLQ() {
    const data = await api('/api/dlq');
    setEntries(data);
  }

  useEffect(() => { fetchDLQ().catch(console.error); }, []);

  async function retryJob(jobId) {
    setRetrying(jobId);
    try {
      await api(`/api/dlq/${jobId}/retry`, { method: 'POST' });
      setEntries(prev => prev.filter(e => e.job_id !== jobId));
    } catch (e) { console.error(e); }
    setRetrying(null);
  }

  return (
    <div className="content-grid anim-stagger">
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', gridColumn: '1 / -1'}}>
        <div style={{color: 'var(--text-secondary)', fontWeight: 600}}>{entries.length} Dead Letter Queue entries found</div>
        <button className="btn-light btn-sm" onClick={fetchDLQ}>↻ Refresh List</button>
      </div>

      <div className="dlq-grid-layout" style={{gridColumn: '1 / -1'}}>
        {entries.map(entry => (
          <div className="card-dlq-item" key={entry.id} style={{background: 'var(--bg-white)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'10px'}}>
              <div>
                <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:800,fontSize:'16px',color:'var(--text-dark)'}}>Job #{entry.job_id}</span>
                <span style={{color:'var(--text-secondary)',marginLeft:12,fontSize:13,fontWeight:500}}>{entry.queue_name} · {entry.type}</span>
              </div>
              <button 
                className="btn-purple btn-sm" 
                disabled={retrying === entry.job_id}
                onClick={() => retryJob(entry.job_id)}
                style={{borderRadius: '8px'}}
              >
                {retrying === entry.job_id ? 'Requeuing...' : '↻ Requeue Job'}
              </button>
            </div>

            <div style={{display:'flex',gap:16,fontSize:12,color:'var(--text-secondary)',fontWeight:500}}>
              <span>Attempts: <strong style={{color:'var(--text-dark)'}}>{entry.attempt_count}</strong></span>
              <span>Moved to DLQ: {new Date(entry.moved_at).toLocaleString()}</span>
              <span>Created: {new Date(entry.job_created_at).toLocaleString()}</span>
            </div>

            <div className="dlq-error-box">
              <span style={{fontWeight: 700}}>Final Error Stack:</span> {entry.final_error}
            </div>

            {entry.ai_summary && entry.ai_summary !== 'summary pending' && (
              <div className="dlq-summary-box">
                <span style={{fontSize:11,color:'var(--green)',fontWeight:800,letterSpacing:'0.03em'}}>🤖 AI FAILURE ANALYSIS:</span>
                <p style={{marginTop: '4px', lineHeight: 1.5}}>{entry.ai_summary}</p>
              </div>
            )}

            {entry.payload && Object.keys(entry.payload).length > 0 && (
              <details style={{fontSize:13}}>
                <summary style={{cursor:'pointer',color:'var(--text-secondary)',fontWeight:600,userSelect:'none'}}>Inspect Failed Job Payload</summary>
                <pre style={{
                  background: 'var(--bg-card-dark)',
                  border: '1px solid var(--border-light)',
                  padding:'12px',
                  borderRadius:'8px',
                  marginTop:'8px',
                  fontFamily:"'JetBrains Mono',monospace",
                  fontSize:11.5,
                  overflow:'auto',
                  color: 'var(--text-dark)'
                }}>
                  {JSON.stringify(entry.payload, null, 2)}
                </pre>
              </details>
            )}
          </div>
        ))}

        {entries.length === 0 && (
          <div className="card-white empty-state">
            <div className="icon">✅</div>
            <p>No dead-letter entries. All job executions completed successfully or are currently retrying.</p>
          </div>
        )}
      </div>
    </div>
  );
}
