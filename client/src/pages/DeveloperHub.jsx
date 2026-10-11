import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import api, { compact, errMsg, money, num } from '../api';
import { Alert, AreaChart, BarChart, Empty, Field, ScoreBadge, Spinner, Stat, VerifiedBadge, useTitle } from '../components/ui';

const STATUS_TONE = { PUBLISHED: 'text-mint', PENDING: 'text-amber', DRAFT: 'text-slate-400', REJECTED: 'text-danger', SUSPENDED: 'text-danger' };

function Funnel({ f }) {
  const steps = [['VISITORS', f.visitors], ['PLAYED', f.played], ['WISHLISTED', f.wishlisted], ['FOLLOWED', f.followed], ['BACKED', f.backed], ['PURCHASED', f.purchased]];
  const max = Math.max(...steps.map((s) => s[1]), 1);
  return <div className="space-y-2">{steps.map(([l, v], i) => <div key={l}><div className="mx-auto flex h-10 items-center justify-between rounded-lg bg-gradient-to-r from-brand/80 to-brand-deep/60 px-4 text-sm font-semibold text-white transition-all" style={{ width: `${Math.max(28, (100 * v) / max)}%`, opacity: 1 - i * 0.08 }}><span className="font-display">{num(v)}</span><span className="text-[11px] tracking-wide text-white/80">{l}</span></div>{i < steps.length - 1 && <div className="text-center text-xs leading-none text-slate-600">↓ {steps[i][1] ? Math.round((100 * steps[i + 1][1]) / steps[i][1]) : 0}%</div>}</div>)}</div>;
}

function Verification({ studioVerified }) {
  const [v, setV] = useState(undefined); const [open, setOpen] = useState(false); const [err, setErr] = useState('');
  const [f, setF] = useState({ legalName: '', document: '', payoutInfo: '', evidence: '' });
  const load = () => api.get('/dev/verification').then((r) => setV(r.data.verification));
  useEffect(() => { load(); }, []);
  const submit = async (e) => { e.preventDefault(); setErr(''); try { await api.post('/dev/verification', f); setOpen(false); load(); } catch (x) { setErr(errMsg(x)); } };
  const u = (k) => (e) => setF({ ...f, [k]: e.target.value });
  if (v === undefined) return null;
  return (
    <div className="card space-y-3 p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-display text-lg font-semibold text-white">GameVest Verification</h2>
      {v?.status === 'APPROVED' ? <VerifiedBadge /> : <span className="chip">{v ? v.status : 'NOT SUBMITTED'}</span>}</div>
      {v?.status === 'APPROVED' ? <p className="text-sm text-slate-400">Your studio passed GameVest's checks. You can launch campaigns once a game is published.</p> : <>
        <p className="text-sm text-slate-400">Verification is required to run a funding campaign. We review identity, studio details, payout info and development evidence. {v?.notes && <b className="text-amber">Reviewer note: {v.notes}</b>}</p>
        {v?.status !== 'PENDING' && !open && <button className="btn-primary" onClick={() => setOpen(true)}>{v ? 'Resubmit' : 'Start verification'}</button>}
        {v?.status === 'PENDING' && <Alert tone="info">Submitted — under review by the GameVest team.</Alert>}
        {open && <form onSubmit={submit} className="space-y-3">{err && <Alert tone="error">{err}</Alert>}
          <Field label="Responsible person / legal entity name"><input className="input" required value={f.legalName} onChange={u('legalName')} /></Field>
          <Field label="Tax ID / document (masked, e.g. ***.***.***-00)" hint="Never send full documents here; our partner collects them securely."><input className="input" required value={f.document} onChange={u('document')} /></Field>
          <Field label="Payout reference" hint="Bank details are collected by our payment provider, not by GameVest."><input className="input" required value={f.payoutInfo} onChange={u('payoutInfo')} /></Field>
          <Field label="Development evidence" hint="Links to prototype/demo, repository history, roadmap, previous work."><textarea className="input" rows={4} required minLength={20} value={f.evidence} onChange={u('evidence')} /></Field>
          <div className="flex gap-2"><button className="btn-primary">Submit for review</button><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button></div></form>}</>}
    </div>
  );
}

export default function DeveloperHub() {
  useTitle('Developer Hub'); const { user } = useAuth();
  const [games, setGames] = useState(null); const [dash, setDash] = useState(null); const [gid, setGid] = useState('');
  useEffect(() => { api.get('/dev/games').then((r) => setGames(r.data.games)); }, []);
  useEffect(() => { setDash(null); api.get('/dev/dashboard', { params: gid ? { gameId: gid } : {} }).then((r) => setDash(r.data)); }, [gid]);
  const t = dash?.totals;
  return (
    <div className="space-y-8 px-4 py-8 md:py-10">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="font-display text-3xl font-bold text-white">Developer Dashboard</h1><p className="text-slate-400">{user.studio?.name} · proof that there's a market for your game.</p></div><Link to="/submit" className="btn-primary">+ SUBMIT GAME</Link></div>
      <Verification />
      <section className="space-y-3"><h2 className="section-title">Your games</h2>
        {!games ? <Spinner /> : games.length === 0 ? <Empty>No games yet. <Link className="text-brand-soft underline" to="/submit">Submit your first one</Link>.</Empty> : <div className="grid gap-3 md:grid-cols-2">{games.map((g) => (
          <Link key={g.id} to={`/developer/games/${g.id}`} className="card flex items-center justify-between gap-3 p-4 hover:border-brand/50"><div><div className="font-display font-semibold text-white">{g.title}</div><div className="text-xs text-slate-500">{g.stage.replace('_', ' ')} · {g.progress}% · ♥ {g._count.wishlist} · 👥 {g._count.follows}{g.campaigns[0] && ` · campaign ${g.campaigns[0].status.toLowerCase()}${g.campaigns[0].adminApproved ? '' : ' (awaiting approval)'}`}</div></div><div className="text-right"><ScoreBadge score={g.score} /><div className={`mt-1 text-xs font-semibold ${STATUS_TONE[g.status]}`}>{g.status}</div></div></Link>))}</div>}</section>

      <section className="space-y-5">
        <div className="flex items-center justify-between"><h2 className="section-title">Analytics · last 30 days</h2>{dash && <select className="input !w-auto" aria-label="Game" value={gid} onChange={(e) => setGid(e.target.value)}><option value="">All games</option>{dash.games.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}</select>}</div>
        {!dash ? <Spinner /> : <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            <Stat label="Total players" value={compact(t.players)} /><Stat label="Followers" value={compact(t.followers)} /><Stat label="Wishlist" value={compact(t.wishlist)} /><Stat label="Funding" value={money(t.fundingCents)} /><Stat label="Sales" value={money(t.salesCents)} /><Stat label="Conversion" value={`${t.conversion}%`} /><Stat label="GameVest Score" value={t.score} tone="text-mint" /><Stat label="Rating" value={t.rating ? t.rating.toFixed(1) : '—'} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {[['Players — 30 days', 'players', '#8b7bff'], ['Wishlist growth (30d)', 'wishlistTotal', '#6ee7b7'], ['Follower growth (30d)', 'followersTotal', '#fbbf24'], ['Funding', 'fundingCents', '#6ee7b7', (v) => money(v)], ['Sales', 'salesCents', '#a99dff', (v) => money(v)]].map(([title, key, color, fmt]) => <div key={key} className="card p-5"><h3 className="mb-3 text-sm font-semibold text-white">{title}</h3><AreaChart data={dash.series} y={key} color={color} fmt={fmt} /></div>)}
            <div className="card p-5"><h3 className="mb-3 text-sm font-semibold text-white">Ratings</h3><BarChart data={[...dash.ratings].reverse().map((r) => ({ ...r, rating: `${r.rating}★` }))} label="rating" value="count" color="#fbbf24" /></div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card p-5"><h3 className="mb-4 text-sm font-semibold text-white">Conversion funnel</h3><Funnel f={dash.funnel} /></div>
            <div className="space-y-4">
              <div className="card p-5"><h3 className="mb-3 text-sm font-semibold text-white">Demo retention</h3><div className="grid grid-cols-2 gap-3 text-center"><Stat label="Sessions" value={num(dash.retention.sessions)} /><Stat label="Avg. play time" value={`${Math.floor(dash.retention.avgPlaySec / 60)}m ${dash.retention.avgPlaySec % 60}s`} /><Stat label="Completion" value={`${dash.retention.completionPct}%`} /><Stat label="Played 5+ min" value={`${dash.retention.over5minPct}%`} /></div></div>
              <div className="card p-5"><h3 className="mb-1 text-sm font-semibold text-white">Player feedback <span className="font-normal text-slate-500">({dash.feedback.count} anonymous responses)</span></h3>
                {dash.feedback.count === 0 ? <p className="text-sm text-slate-500">No feedback yet.</p> : <><div className="my-3 grid grid-cols-4 gap-2 text-center text-xs"><div><b className="block font-display text-lg text-white">{dash.feedback.avgRating.toFixed(1)}</b>avg ★</div><div><b className="block font-display text-lg text-white">{dash.feedback.wouldPlayAgainPct}%</b>play again</div><div><b className="block font-display text-lg text-white">{dash.feedback.wouldBuyPct}%</b>would buy</div><div><b className="block font-display text-lg text-white">{dash.feedback.avgPriceCents ? money(dash.feedback.avgPriceCents) : '—'}</b>avg price</div></div>
                  {dash.feedback.improve.length > 0 && <ul className="space-y-1 text-sm text-slate-300">{dash.feedback.improve.map((i, k) => <li key={k} className="rounded-lg bg-ink-900 px-3 py-1.5">“{i.text}”</li>)}</ul>}</>}</div>
            </div>
          </div>
        </>}
      </section>
    </div>
  );
}
