import React, { useEffect, useState } from 'react';

export default function AdminPanel({ auth }) {
  const [polls, setPolls] = useState([]);
  const backend = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';

  async function load() {
    if (!auth) return;
    const res = await fetch(backend + '/api/admin/polls', { headers: { authorization: 'Bearer ' + auth.token } });
    if (!res.ok) return alert('Failed to load admin polls');
    const data = await res.json();
    setPolls(data.polls || []);
  }

  useEffect(() => { load(); }, []);

  async function publish(pollId) {
    const res = await fetch(backend + `/api/polls/${pollId}/publish`, { method: 'POST', headers: { authorization: 'Bearer ' + auth.token } });
    if (!res.ok) return alert('Publish failed');
    load();
  }

  async function closePoll(pollId) {
    const res = await fetch(backend + `/api/polls/${pollId}/close`, { method: 'POST', headers: { authorization: 'Bearer ' + auth.token } });
    if (!res.ok) return alert('Close failed');
    load();
  }

  async function del(pollId) {
    if(!confirm('Delete poll?')) return;
    const res = await fetch(backend + `/api/polls/${pollId}`, { method: 'DELETE', headers: { authorization: 'Bearer ' + auth.token } });
    if (!res.ok) return alert('Delete failed');
    load();
  }

  return (
    <div>
      <h3>Admin Panel</h3>
      <div style={{display:'flex',flexDirection:'column',gap:10}}>
        {polls.map(p => (
          <div key={p.id} className="poll-item">
            <div>
              <div style={{fontWeight:700}}>{p.question}</div>
              <div style={{fontSize:13,color:'#9aa4b2'}}>{p.creator.name} • {p.isPublished? 'Published':'Unpublished'} {p.isClosed? '• Closed':''}</div>
            </div>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              {!p.isPublished && <button className="small btn" onClick={() => publish(p.id)}>Publish</button>}
              {!p.isClosed && <button className="small btn" onClick={() => closePoll(p.id)}>Close</button>}
              <button className="small btn" onClick={() => del(p.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}