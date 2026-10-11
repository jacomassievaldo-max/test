import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { ago, compact, errMsg, money } from '../api';
import { Alert, GameCard, Spinner, Stat, VerifiedBadge, useTitle } from '../components/ui';

export default function Studio() {
  const { slug } = useParams(); const [d, setD] = useState(null); const [err, setErr] = useState('');
  useEffect(() => { api.get(`/studios/${slug}`).then((r) => setD(r.data)).catch((e) => setErr(errMsg(e))); }, [slug]);
  useTitle(d?.studio.name);
  if (err) return <div className="p-16 text-center text-slate-400">{err}</div>;
  if (!d) return <Spinner />;
  const { studio: s, reputation: r } = d;
  return (
    <div className="space-y-10 px-4 py-8 md:py-10">
      <header className="card flex flex-col gap-6 p-6 md:flex-row md:items-center md:p-8">
        <div className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand to-mint font-display text-3xl font-bold text-ink-950">{s.name[0]}</div>
        <div className="flex-1 space-y-1"><h1 className="font-display text-3xl font-bold uppercase text-white">{s.name}</h1>
          <div>{s.verified ? <VerifiedBadge /> : <span className="text-sm text-slate-500">Not yet verified</span>}</div>
          <p className="text-sm text-slate-400">{s.country} · Member since {new Date(s.memberSince).getFullYear()}</p>{s.description && <p className="max-w-xl pt-1 text-sm text-slate-300">{s.description}</p>}</div>
        {r && <div className="rounded-2xl border border-ink-500 bg-ink-900 p-5 text-center"><div className="text-xs uppercase tracking-wide text-slate-500">Developer reputation</div><div className="font-display text-4xl font-bold text-white">{r.score}<span className="text-lg text-slate-500">/100</span></div></div>}
      </header>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Games" value={d.games.length} /><Stat label="Followers" value={compact(d.followers)} /><Stat label="Released" value={r?.gamesReleased ?? 0} /><Stat label="Campaigns done" value={r?.campaignsCompleted ?? 0} /><Stat label="Positive reviews" value={r?.positivePct ? `${r.positivePct}%` : '—'} />
      </div>
      <Alert tone="info">Reputation is calculated from verified history (releases, completed campaigns, reviews, reports, refunds). It can't be bought or edited by the developer.</Alert>
      <section><h2 className="section-title mb-4">Games</h2><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{d.games.map((g) => <GameCard key={g.id} game={g} />)}</div></section>
      {d.campaigns.length > 0 && <section><h2 className="section-title mb-4">Campaign history</h2><div className="space-y-2">{d.campaigns.map((c) => <div key={c.id} className="card flex flex-wrap items-center justify-between gap-2 p-4 text-sm"><Link to={`/games/${c.game.slug}`} className="font-medium text-white hover:underline">{c.title}</Link><span className="text-slate-400">{money(c.raisedCents)} / {money(c.goalCents)} · {c.backers} backers</span><span className="chip">{c.status}</span></div>)}</div></section>}
      {d.updates.length > 0 && <section><h2 className="section-title mb-4">Recent updates</h2><div className="space-y-2">{d.updates.map((u) => <div key={u.id} className="card p-4 text-sm"><div className="text-xs text-slate-500">{u.game.title} · {ago(u.createdAt)}</div><b className="text-white">{u.title}</b></div>)}</div></section>}
    </div>
  );
}
