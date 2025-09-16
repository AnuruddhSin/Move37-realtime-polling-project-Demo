import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

export default function PollView({ pollId, back, auth }) {
  const [poll, setPoll] = useState(null);
  const [results, setResults] = useState(null);
  const [voters, setVoters] = useState([]);
  const backend = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (!pollId) return;
    fetch(backend + '/api/polls/' + pollId).then(r => r.json()).then(data => {
      setPoll(data);
      setResults({ results: data.options });
    }).catch(console.error);
  }, [pollId]);

  useEffect(() => {
    const s = io(backend);
    setSocket(s);
    s.emit('joinPoll', pollId);
    s.on('voteUpdate', (data) => {
      if (Number(data.pollId) === Number(pollId)) {
        setResults(data);
      }
    });
    s.on('pollClosed', () => {
      fetch(backend + '/api/polls/' + pollId).then(r => r.json()).then(setPoll);
    });
    return () => {
      s.emit('leavePoll', pollId);
      s.disconnect();
    };
  }, [pollId]);

  async function vote(optionId) {
    if (!auth) return alert('Login first');
    const res = await fetch(`${backend}/api/polls/${pollId}/vote`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + auth.token },
      body: JSON.stringify({ optionId })
    });
    if (!res.ok) {
      const err = await res.json();
      return alert('Error: ' + (err.error || JSON.stringify(err)));
    }
    const data = await res.json();
    setResults(data);
  }

  async function loadVoters() {
    if (!auth || auth.user.role !== 'ADMIN') return alert('Admin login required');
    const res = await fetch(`${backend}/api/polls/${pollId}/voters`, { headers: { authorization: 'Bearer ' + auth.token } });
    if (!res.ok) { const e = await res.json(); return alert('Error: ' + (e.error||JSON.stringify(e))); }
    const data = await res.json();
    setVoters(data);
  }

  async function deletePoll() {
    if (!auth || auth.user.role !== 'ADMIN') return alert('Admin login required');
    if(!confirm('Delete this poll permanently?')) return;
    const res = await fetch(`${backend}/api/polls/${pollId}`, { method: 'DELETE', headers: { authorization: 'Bearer ' + auth.token } });
    if(!res.ok){ const e = await res.json(); return alert('Error: '+(e.error||JSON.stringify(e))); }
    alert('Poll deleted');
    back();
  }

  async function closePoll() {
    if (!auth || auth.user.role !== 'ADMIN') return alert('Admin login required');
    const res = await fetch(`${backend}/api/polls/${pollId}/close`, { method: 'POST', headers: { authorization: 'Bearer ' + auth.token } });
    if (!res.ok) { const e = await res.json(); return alert('Error: ' + (e.error||JSON.stringify(e))); }
    const data = await res.json();
    setPoll(data);
  }

  if (!poll) return <div>Loading...</div>;

  const total = (results && results.results) ? results.results.reduce((s,r)=>s+(r.count||0),0) : poll.options.reduce((s,o)=>s+(o.count||0),0);

  return (
    <div>
      <button className="small" onClick={back}>← Back</button>
      <h3 style={{marginTop:8}}>{poll.question}</h3>
      <div style={{fontSize:13,color:'#9aa4b2',marginBottom:8}}>Creator: {poll.creator.name} • {poll.isPublished? 'Published':'Unpublished'} {poll.isClosed? '• Closed':''} {poll.publishAt ? '• Publish at: '+new Date(poll.publishAt).toLocaleString() : ''}</div>
      <div className="card" style={{marginTop:10}}>
        {(results && results.results ? results.results : poll.options).map(opt => {
          const pct = total ? Math.round(((opt.count||0)/total)*100) : 0;
          return (
            <div key={opt.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.02)'}}>
              <div style={{display:'flex',alignItems:'center'}}>
                <div style={{fontWeight:700}}>{opt.text}</div>
                <div className="vote-bar"><div className="vote-filled" style={{width: pct + '%'}}>{pct>6? pct + '%':''}</div></div>
              </div>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <div style={{minWidth:36,textAlign:'right',fontWeight:700}}>{opt.count ?? 0}</div>
                <button className="btn small" disabled={poll.isClosed} onClick={() => vote(opt.id)}>Vote</button>
              </div>
            </div>
          )
        })}
      </div>

      {auth && auth.user.role === 'ADMIN' && (
        <div style={{marginTop:12, display:'flex', gap:8}}>
          <button className="small btn" onClick={closePoll}>Close Poll</button>
          <button className="small btn" onClick={() => { if(confirm('Delete this poll?')) { closePoll(); /* placeholder */ } }}>Delete Poll</button>
          <button className="small btn" onClick={async () => {
            const newQ = prompt('Enter new question', poll.question);
            if(!newQ) return;
            const optTexts = poll.options.map(o=>o.text).join('\n');
            const newOpts = prompt('Enter options (one per line)', optTexts);
            try {
              const body = { question: newQ, options: newOpts ? newOpts.split('\n').map(s=>s.trim()).filter(Boolean) : [] };
              const res = await fetch(`${backend}/api/polls/${pollId}`, { method: 'PUT', headers: { 'content-type':'application/json', 'authorization': 'Bearer '+ (auth?auth.token:'') }, body: JSON.stringify(body) });
              if(!res.ok){ const e=await res.json(); return alert('Error: '+(e.error||JSON.stringify(e))); }
              const updated = await res.json(); setPoll(updated); alert('Poll updated');
            } catch(err){ console.error(err); alert('Update failed'); }
          }}>Edit Poll</button>
          <button className="small btn" onClick={loadVoters}>Load Voters</button>
        </div>
      )}

      {voters.length > 0 && (
        <div className="card" style={{marginTop:12}}>
          <h4>Voters</h4>
          <ul style={{listStyle:'none',padding:0}}>
            {voters.map(v => (
              <li key={v.id} style={{padding:'6px 0',borderBottom:'1px solid rgba(255,255,255,0.02)'}}>{v.user.name} ({v.user.email}) — {v.option.text} <span style={{color:'#9aa4b2',fontSize:12,marginLeft:8}}>{new Date(v.createdAt).toLocaleString()}</span></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}