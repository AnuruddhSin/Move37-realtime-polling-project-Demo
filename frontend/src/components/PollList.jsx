import React, { useEffect, useState } from 'react';

export default function PollList({ onOpen, auth }) {
  const [polls, setPolls] = useState([]);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({});
  const backend = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';

  async function load() {
    const res = await fetch(`${backend}/api/polls?q=${encodeURIComponent(q)}&page=${page}`);
    const data = await res.json();
    setPolls(data.polls || []);
    setMeta({ total: data.total, page: data.page, limit: data.limit });
  }

  useEffect(() => { load(); }, [q, page]);

  return (
    <div>
      <div style={{display:'flex',gap:8,marginBottom:12}}>
        <input className="input" value={q} onChange={e=>{setQ(e.target.value); setPage(1)}} placeholder="Search polls..." />
        <button className="small btn" onClick={() => load()}>Search</button>
      </div>
      <h3 style={{marginTop:0}}>Available Polls</h3>
      <div style={{display:'flex',flexDirection:'column',gap:10}}>
        {polls.map(p => (
          <div key={p.id} className="poll-item">
            <div>
              <div style={{fontWeight:700}}>{p.question}</div>
              <div className="poll-meta">{p.options.map(o => `${o.text} (${o.count})`).join(' • ')}</div>
            </div>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <button className="small" onClick={() => onOpen(p.id)}>View</button>
              {/* Admin delete could be added here */}
            </div>
          </div>
        ))}
      </div>

      <div style={{marginTop:12, display:'flex',gap:8,alignItems:'center'}}>
        <button className="small" onClick={()=>setPage(Math.max(1,page-1))}>Prev</button>
        <div style={{fontSize:13,color:'#9aa4b2'}}>Page {meta.page || 1} — Total {meta.total || 0}</div>
        <button className="small" onClick={()=>setPage(page+1)}>Next</button>
      </div>
    </div>
  );
}