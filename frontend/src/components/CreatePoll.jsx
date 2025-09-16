import React, { useState } from 'react';
export default function CreatePoll({ onCreated, auth }) {
  const [question, setQuestion] = useState('');
  const [opts, setOpts] = useState(['','']);
  const [publishAt, setPublishAt] = useState('');
  const backend = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';

  function setOptionAt(i, v) { const a = [...opts]; a[i] = v; setOpts(a); }
  function addOption() { setOpts([...opts, '']); }

  async function submit(e) {
    e.preventDefault();
    if (!question || opts.filter(Boolean).length < 2) return alert('Question and at least 2 options required');
    const payload = { question, options: opts.filter(Boolean), publishAt: publishAt ? new Date(publishAt).toISOString() : null };
    const res = await fetch(backend + '/api/polls', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'authorization': auth ? 'Bearer '+auth.token : '' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json();
      return alert('Error: ' + (err.error || JSON.stringify(err)));
    }
    const poll = await res.json();
    setQuestion(''); setOpts(['','']); setPublishAt('');
    if (onCreated) onCreated(poll.id);
  }

  return (
    <form onSubmit={submit} className="card">
      <div style={{marginBottom:8}}><input className="input" value={question} onChange={e => setQuestion(e.target.value)} placeholder="Question" /></div>
      <div>
        {opts.map((o,i) => (
          <div key={i} className="option-row">
            <input className="input" value={o} onChange={e => setOptionAt(i, e.target.value)} placeholder={`Option ${i+1}`} />
          </div>
        ))}
        <div style={{marginTop:8}}><button type="button" className="small btn" onClick={addOption}>Add option</button></div>
      </div>
      <div style={{marginTop:8}}>
        <label style={{fontSize:12,color:'#9aa4b2'}}>Publish At (optional)</label>
        <input className="input" type="datetime-local" value={publishAt} onChange={e=>setPublishAt(e.target.value)} />
      </div>
      <div style={{marginTop:12}}><button className="btn" type="submit">Create Poll</button></div>
    </form>
  );
}