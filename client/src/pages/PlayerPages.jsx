import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { ago, errMsg, money } from '../api';
import { Alert, Empty, Field, GameCard, GameCover, Modal, Spinner, useTitle } from '../components/ui';

export function Wishlist() {
  useTitle('Wishlist');
  const [g, setG] = useState(null);
  useEffect(() => { api.get('/me/wishlist').then((r) => setG(r.data.games)); }, []);
  return (
    <div className="px-4 py-8 md:py-10"><h1 className="mb-6 font-display text-3xl font-bold text-white">Wishlist</h1>
      {!g ? <Spinner /> : g.length === 0 ? <Empty>Your wishlist is empty. <Link to="/discover" className="text-brand-soft underline">Discover games</Link></Empty> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{g.map((x) => <GameCard key={x.id} game={x} />)}</div>}
      <FollowedUpdates />
    </div>
  );
}
function FollowedUpdates() {
  const [d, setD] = useState(null);
  useEffect(() => { api.get('/me/following').then((r) => setD(r.data)); }, []);
  if (!d?.updates.length) return null;
  return <section className="mt-12"><h2 className="section-title mb-4">Updates from games you follow</h2><div className="space-y-2">{d.updates.map((u) => <Link key={u.id} to={`/games/${u.game.slug}`} className="card block p-4 text-sm hover:border-brand/50"><div className="text-xs text-slate-500">{u.game.title} · {ago(u.createdAt)}</div><b className="text-white">{u.title}</b><p className="line-clamp-2 text-slate-400">{u.body}</p></Link>)}</div></section>;
}

function LibCard({ e, badge }) {
  const g = e.game;
  return (
    <div className="card overflow-hidden"><GameCover game={g} className="aspect-[16/8] w-full" />
      <div className="space-y-2 p-4"><div className="flex items-center justify-between"><Link to={`/games/${g.slug}`} className="font-display font-semibold text-white hover:underline">{g.title}</Link><span className="chip">{badge}</span></div>
        <div className="text-xs text-slate-400">{g.studio.name}{g.latestBuild && ` · v${g.latestBuild.version} (${g.latestBuild.platform})`}</div>
        {e.dlcs?.length > 0 && <div className="text-xs text-slate-500">DLC: {e.dlcs.map((d) => `${d.title}${d.owned ? ' ✓' : ''}`).join(', ')}</div>}
        <div className="flex gap-2 pt-1"><Link to={`/games/${g.slug}`} className="btn-primary !py-2 flex-1">{g.hasDemo && !e.sources?.includes('PURCHASE') ? '▶ Play demo' : 'Open'}</Link><button className="btn-ghost !py-2 opacity-60" disabled title="The GameVest Launcher is coming later">Install</button></div></div></div>
  );
}

export function Library() {
  useTitle('Library');
  const [d, setD] = useState(null);
  useEffect(() => { api.get('/library').then((r) => setD(r.data)); }, []);
  if (!d) return <Spinner />;
  const Section = ({ title, items, badge }) => items.length > 0 && <section className="space-y-3"><h2 className="section-title">{title}</h2><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{items.map((e) => <LibCard key={e.game.id} e={e} badge={badge} />)}</div></section>;
  const empty = !d.owned.length && !d.backed.length && !d.demos.length;
  return (
    <div className="space-y-10 px-4 py-8 md:py-10">
      <div><h1 className="font-display text-3xl font-bold text-white">GameVest Library</h1><p className="text-slate-400">Your games, backed projects, demos and purchase history. Downloads, auto-updates and cloud saves will arrive with the GameVest Launcher.</p></div>
      {empty && <Empty>Nothing here yet. <Link className="text-brand-soft underline" to="/demos">Play a demo</Link> or <Link className="text-brand-soft underline" to="/funding">back a project</Link>.</Empty>}
      <Section title="Purchased games" items={d.owned} badge="Owned" />
      <Section title="Backed projects" items={d.backed} badge="Backer" />
      <Section title="Demos you played" items={d.demos} badge="Demo" />
      <section className="space-y-3"><div className="flex items-center justify-between"><h2 className="section-title">Purchase history</h2><Link to="/refunds" className="text-sm text-brand-soft hover:underline">Refund Center →</Link></div>
        {d.history.length === 0 ? <p className="text-sm text-slate-500">No purchases yet.</p> : <div className="card divide-y divide-ink-600">{d.history.map((h) => <div key={h.type + h.id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm"><div><div className="font-medium text-white">{h.title} <span className="text-slate-500">· {h.game.title}</span></div><div className="text-xs text-slate-500">{h.kind.replaceAll('_', ' ')} · {new Date(h.at).toLocaleDateString()} · terms v{h.termsVersion}{h.delivery && ` · delivery ${h.delivery.toLowerCase().replace('_', ' ')}`}</div></div><div className="flex items-center gap-3"><b className="text-white">{money(h.amountCents, { exact: true })}</b>{h.refund && <span className="chip">refund: {h.refund.status.replace('_', ' ').toLowerCase()}</span>}</div></div>)}</div>}
      </section>
    </div>
  );
}

const REASONS = [['NOT_AS_DESCRIBED', 'Not as described'], ['TECHNICAL', 'Technical problems'], ['NOT_DELIVERED', 'Not delivered'], ['DUPLICATE_CHARGE', 'Duplicate charge'], ['UNAUTHORIZED', 'Unauthorized purchase'], ['MISLEADING', 'Misleading information'], ['CHANGED_MIND', 'Changed my mind'], ['OTHER', 'Other']];
const TONE = { AUTO_APPROVED: 'text-mint', PAID: 'text-mint', APPROVED: 'text-mint', DENIED: 'text-danger', UNDER_REVIEW: 'text-amber', REQUESTED: 'text-amber' };

export function Refunds() {
  useTitle('Refund Center');
  const [lib, setLib] = useState(null); const [refunds, setRefunds] = useState([]); const [pol, setPol] = useState([]); const [target, setTarget] = useState(null);
  const load = () => { api.get('/library').then((r) => setLib(r.data)); api.get('/refunds').then((r) => setRefunds(r.data.refunds)); };
  useEffect(() => { load(); api.get('/policies/refund').then((r) => setPol(r.data.policies)); }, []);
  const [f, setF] = useState({ reason: 'NOT_AS_DESCRIBED', details: '' }); const [res, setRes] = useState(null); const [err, setErr] = useState('');
  const submit = async (e) => { e.preventDefault(); setErr(''); try { const { data } = await api.post('/refunds', { [target.type === 'PURCHASE' ? 'purchaseId' : 'backingId']: target.id, ...f, details: f.details || undefined }); setRes(data.refund); load(); } catch (x) { setErr(errMsg(x)); } };
  const open = (h) => { setTarget(h); setRes(null); setErr(''); setF({ reason: 'NOT_AS_DESCRIBED', details: '' }); };
  const eligible = lib?.history.filter((h) => !h.refund || h.refund.status === 'DENIED') ?? [];
  const scopeOf = (h) => (h.type === 'BACKING' ? 'CROWDFUNDING' : { GAME: 'RELEASED_GAME', DLC: 'DLC', EARLY_ACCESS: 'EARLY_ACCESS', PRE_ORDER: 'PRE_ORDER' }[h.kind]);
  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-8 md:py-10">
      <div><h1 className="font-display text-3xl font-bold text-white">GameVest Refund Center</h1><p className="text-slate-400">My purchases → request a refund → automatic or manual review → result.</p></div>
      <section className="space-y-3"><h2 className="section-title">My purchases</h2>
        {!lib ? <Spinner /> : eligible.length === 0 ? <Empty>No purchases available for refund.</Empty> : eligible.map((h) => <div key={h.type + h.id} className="card flex flex-wrap items-center justify-between gap-3 p-4"><div><div className="font-medium text-white">{h.title} <span className="text-slate-500">· {h.game.title}</span></div><div className="text-xs text-slate-500">{h.kind.replaceAll('_', ' ')} · {ago(h.at)} · {money(h.amountCents, { exact: true })}</div></div><button className="btn-ghost !py-2" onClick={() => open(h)}>Request refund</button></div>)}</section>
      <section className="space-y-3"><h2 className="section-title">My requests</h2>
        {refunds.length === 0 ? <p className="text-sm text-slate-500">No refund requests yet.</p> : refunds.map((r) => <div key={r.id} className="card p-4 text-sm"><div className="flex flex-wrap justify-between gap-2"><span className="font-medium text-white">{r.purchase?.itemTitle ?? r.backing?.campaign.title} · {money(r.amountCents, { exact: true })}</span><b className={TONE[r.status]}>{r.status.replaceAll('_', ' ')}</b></div><div className="text-xs text-slate-500">{ago(r.createdAt)} · {r.scope.replaceAll('_', ' ')} · {r.reason.replaceAll('_', ' ').toLowerCase()}</div>{r.decisionNote && <p className="mt-1 text-slate-300">{r.decisionNote}</p>}</div>)}</section>
      <section id="policies" className="space-y-3"><h2 className="section-title">Rules by purchase type</h2><div className="grid gap-3 md:grid-cols-2">{pol.map((p) => <div key={p.scope} className="rounded-xl border border-ink-600 bg-ink-800 p-4"><div className="text-xs font-semibold uppercase tracking-wide text-brand-soft">{p.scope.replaceAll('_', ' ')}</div><p className="mt-1 text-sm text-slate-300">{p.summary}</p></div>)}</div></section>
      <Modal open={!!target} onClose={() => setTarget(null)} title="Request a refund">
        {res ? <div className="space-y-4"><Alert tone={res.status === 'DENIED' ? 'error' : res.status === 'UNDER_REVIEW' ? 'warn' : 'ok'}><b>{res.status.replaceAll('_', ' ')}</b> — {res.decisionNote}</Alert><button className="btn-primary" onClick={() => setTarget(null)}>Done</button></div> : target && (
          <form onSubmit={submit} className="space-y-4"><div className="rounded-xl bg-ink-900 p-3 text-sm"><b className="text-white">{target.title}</b> · {money(target.amountCents, { exact: true })}<p className="mt-1 text-xs text-slate-400">{pol.find((p) => p.scope === scopeOf(target))?.summary}</p></div>
            {err && <Alert tone="error">{err}</Alert>}
            <Field label="Reason"><select className="input" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })}>{REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
            <Field label="Details (optional)"><textarea rows={3} maxLength={1000} className="input" value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} /></Field>
            <button className="btn-primary w-full">Submit request</button></form>)}
      </Modal>
    </div>
  );
}
