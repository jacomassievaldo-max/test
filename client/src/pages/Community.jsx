import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { ago } from '../api';
import { GameCover, Spinner, Stars, useTitle } from '../components/ui';

export default function Community() {
  useTitle('Community');
  const [d, setD] = useState(null);
  useEffect(() => { api.get('/community').then((r) => setD(r.data)); }, []);
  if (!d) return <Spinner />;
  return (
    <div className="grid gap-10 px-4 py-8 md:py-10 lg:grid-cols-2">
      <section><h1 className="font-display text-2xl font-bold text-white">Development updates</h1><p className="mb-4 text-sm text-slate-400">Fresh news straight from the developers.</p>
        <div className="space-y-3">{d.updates.map((u) => (
          <Link key={u.id} to={`/games/${u.game.slug}`} className="card flex gap-4 p-4 hover:border-brand/50"><GameCover game={u.game} title={false} className="h-16 w-16 shrink-0 rounded-lg" />
            <div className="min-w-0"><div className="text-xs text-slate-500">{u.game.title} · {u.game.studio.name} · {ago(u.createdAt)}</div><div className="font-semibold text-white">{u.title}</div><p className="line-clamp-2 text-sm text-slate-400">{u.body}</p></div></Link>))}</div></section>
      <section><h2 className="font-display text-2xl font-bold text-white">Latest reviews</h2><p className="mb-4 text-sm text-slate-400">What players are saying.</p>
        <div className="space-y-3">{d.reviews.map((r) => (
          <div key={r.id} className="card p-4"><div className="flex items-center justify-between text-xs"><Link to={`/games/${r.game.slug}`} className="font-semibold text-brand-soft hover:underline">{r.game.title}</Link><Stars value={r.rating} /></div>
            <p className="mt-2 text-sm text-slate-300">{r.body}</p><div className="mt-2 text-xs text-slate-500">{r.author} · {r.recommended ? '👍 Recommended' : '👎 Not recommended'}{r.verified && ' · ✓ played'} · {ago(r.createdAt)}</div></div>))}</div></section>
    </div>
  );
}
