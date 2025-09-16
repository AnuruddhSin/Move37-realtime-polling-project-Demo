import React, { useEffect, useState } from 'react';
import PollList from './components/PollList';
import PollView from './components/PollView';
import CreatePoll from './components/CreatePoll';
import AdminPanel from './components/AdminPanel';

export default function App() {
  const [view, setView] = useState({ name: 'list', pollId: null });
  const [auth, setAuth] = useState(() => {
    try { return JSON.parse(localStorage.getItem('poll_auth') || 'null'); } catch { return null; }
  });

  useEffect(() => { localStorage.setItem('poll_auth', JSON.stringify(auth)); }, [auth]);

  return (
    <div className="container">
      <header className="header">
        <div>
          <div className="brand">Move37 — Realtime Polls</div>
          <div style={{fontSize:13,color:'#9aa4b2'}}>Realtime voting demo</div>
        </div>
        <div className="controls">
          <button className="small btn" onClick={() => setView({name:'list'})}>Polls</button>
          {auth && <button className="small btn" style={{marginLeft:6}} onClick={() => setView({name:'create'})}>Create</button>}{auth && auth.user.role==='ADMIN' && <button className="small btn" style={{marginLeft:6}} onClick={() => setView({name:'admin'})}>Admin Panel</button>}
        </div>
      </header>

      <div className="grid">
        <main>
          {view.name === 'list' && <PollList onOpen={(id) => setView({ name: 'view', pollId: id })} auth={auth} />}
          {view.name === 'view' && <PollView pollId={view.pollId} back={() => setView({ name: 'list' })} auth={auth} />}
          {view.name === 'create' && <CreatePoll onCreated={(id) => setView({ name: 'view', pollId: id })} auth={auth} />}
          {view.name === 'admin' && <AdminPanel auth={auth} />}
        </main>

        <aside className="card">
          {auth ? (
            <div>
              <div style={{fontWeight:700}}>{auth.user.name} {auth.user.role==='ADMIN' && <span style={{fontSize:12,marginLeft:8,color:'#60a5fa'}}>ADMIN</span>}</div>
              <div style={{fontSize:13,color:'#9aa4b2'}}>{auth.user.email}</div>
              <div style={{marginTop:8}}><button className="btn small" onClick={() => { localStorage.removeItem('poll_auth'); setAuth(null); }}>Log out</button></div>
            </div>
          ) : (
            <AuthBox onAuth={(a)=>setAuth(a)} />
          )}
          <div className="footer" style={{marginTop:12,fontSize:13,color:'#9aa4b2'}}>Demo admin: alice@example.com / password 'password'</div>
        </aside>
      </div>
    </div>
  );
}

function AuthBox({ onAuth }) {
  const [name,setName] = useState('');
  const [email,setEmail] = useState('alice@example.com');
  const [pass,setPass] = useState('password');
  const [mode,setMode] = useState('login');
  const backend = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';

  async function submit(e) {
    e && e.preventDefault();
    try {
      const url = backend + (mode==='login' ? '/api/auth/login' : '/api/auth/register');
      const body = mode==='login' ? { email, password: pass } : { name, email, password: pass };
      const res = await fetch(url, { method: 'POST', headers: { 'content-type':'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) { const err = await res.json(); return alert('Error: '+(err.error||JSON.stringify(err))); }
      const data = await res.json();
      onAuth(data);
    } catch (err) { console.error(err); alert('Network error'); }
  }

  return (
    <form onSubmit={submit} style={{display:'flex',flexDirection:'column',gap:8}}>
      {mode==='register' && <input className="input" value={name} onChange={e=>setName(e.target.value)} placeholder="Name" />}
      <input className="input" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email" />
      <input className="input" value={pass} type="password" onChange={e=>setPass(e.target.value)} placeholder="Password" />
      <div style={{display:'flex',gap:8}}>
        <button className="btn" type="submit">{mode==='login' ? 'Login' : 'Register'}</button>
        <button type="button" className="small" onClick={()=>setMode(mode==='login'?'register':'login')}>{mode==='login'?'Switch to register':'Switch to login'}</button>
      </div>
    </form>
  );
}