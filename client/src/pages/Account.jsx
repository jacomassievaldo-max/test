import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import api, { ago } from '../api';
import { useTitle } from '../components/ui';

export default function Account() {
  useTitle('Profile');
  const { user, logout } = useAuth(); const nav = useNavigate();
  const [n, setN] = useState({ items: [], unread: 0 });
  useEffect(() => { api.get('/notifications').then((r) => { setN(r.data); if (r.data.unread) api.post('/notifications/read'); }); }, []);
  const links = [['Library', '/library'], ['Wishlist', '/wishlist'], ['Refund Center', '/refunds'], ...(user.role === 'DEVELOPER' ? [['Developer Hub', '/developer'], ['Submit a game', '/submit']] : []), ...(user.role === 'PUBLISHER' || user.role === 'ADMIN' ? [['GameVest Scout', '/scout']] : []), ...(user.role === 'ADMIN' ? [['Admin dashboard', '/admin']] : [])];
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div className="card flex items-center gap-4 p-5"><div className="grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-brand to-mint font-display text-xl font-bold text-ink-950">{user.name[0]}</div>
        <div className="min-w-0 flex-1"><div className="font-display text-xl font-semibold text-white">{user.name}</div><div className="truncate text-sm text-slate-400">{user.email} · {user.role}{user.studio && ` · ${user.studio.name}`}</div></div></div>
      <div className="grid gap-3 sm:grid-cols-2">{links.map(([l, to]) => <Link key={to} to={to} className="card p-4 font-medium text-white hover:border-brand/50">{l} →</Link>)}</div>
      <section><h2 className="mb-3 font-display text-lg font-semibold text-white">Notifications</h2>
        {n.items.length === 0 ? <p className="text-sm text-slate-500">Nothing yet.</p> : <ul className="space-y-2">{n.items.map((i) => <li key={i.id} className="card p-3 text-sm"><div className="font-medium text-white">{i.title}</div>{i.body && <div className="text-slate-400">{i.body}</div>}<div className="mt-1 flex justify-between text-xs text-slate-500"><span>{ago(i.createdAt)}</span>{i.link && <Link to={i.link} className="text-brand-soft">Open</Link>}</div></li>)}</ul>}</section>
      <button className="btn-ghost" onClick={async () => { await logout(); nav('/'); }}>Sign out</button>
    </div>
  );
}
