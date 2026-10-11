import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { compact, errMsg } from '../api';
import { Alert, Field, GameCover, Modal, ScoreBadge, Spinner, VerifiedBadge, useTitle } from '../components/ui';

export default function Scout() {
  useTitle('GameVest Scout');
  const [f, setF] = useState({ genre: '', stage: '', country: '', minScore: '', minPlayers: '', minWishlist: '', minCompletion: '', minGrowth: '' });
  const [rows, setRows] = useState(null); const [meta, setMeta] = useState({ genres: [] }); const [target, setTarget] = useState(null); const [msg, setMsg] = useState(''); const [out, setOut] = useState(null);
  useEffect(() => { api.get('/meta').then((r) => setMeta(r.data)); }, []);
  useEffect(() => { const t = setTimeout(() => { const params = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== '')); api.get('/scout/projects', { params }).then((r) => setRows(r.data.projects)); }, 250); return () => clearTimeout(t); }, [f]);
  const u = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const send = async () => { try { await api.post('/scout/contact', { studioId: target.studio.id, gameId: target.id, message: msg }); setOut({ t: 'ok', m: 'Your request was sent to the developer.' }); } catch (e) { setOut({ t: 'error', m: errMsg(e) }); } };
  return (
    <div className="space-y-6 px-4 py-8 md:py-10">
      <div><h1 className="font-display text-3xl font-bold text-white">GameVest Scout</h1><p className="text-slate-400">Find promising projects with real traction data. Metrics are aggregated — no player identities.</p></div>
      <div className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Genre"><select className="input" value={f.genre} onChange={u('genre')}><option value="">Any</option>{meta.genres.map((g) => <option key={g}>{g}</option>)}</select></Field>
        <Field label="Stage"><select className="input" value={f.stage} onChange={u('stage')}><option value="">Any</option>{['CONCEPT', 'PROTOTYPE', 'ALPHA', 'BETA', 'EARLY_ACCESS', 'RELEASED'].map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Country"><input className="input" value={f.country} onChange={u('country')} /></Field>
        <Field label="Min. score"><input type="number" className="input" value={f.minScore} onChange={u('minScore')} /></Field>
        <Field label="Min. players"><input type="number" className="input" value={f.minPlayers} onChange={u('minPlayers')} /></Field>
        <Field label="Min. wishlist"><input type="number" className="input" value={f.minWishlist} onChange={u('minWishlist')} /></Field>
        <Field label="Min. demo completion %"><input type="number" className="input" value={f.minCompletion} onChange={u('minCompletion')} /></Field>
        <Field label="Min. monthly growth %"><input type="number" className="input" value={f.minGrowth} onChange={u('minGrowth')} /></Field>
      </div>
      {!rows ? <Spinner /> : <div className="space-y-3">{rows.map((p) => (
        <div key={p.id} className="card flex flex-col gap-4 p-4 md:flex-row md:items-center">
          <GameCover game={p} title={false} className="h-20 w-full shrink-0 rounded-lg md:w-36" />
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><Link to={`/games/${p.slug}`} className="font-display text-lg font-semibold text-white hover:underline">{p.title}</Link><ScoreBadge score={{ total: p.score }} /></div><div className="text-xs text-slate-400">{p.genres.join(' · ')} · {p.stage.replace('_', ' ')} · {p.studio.name} {p.studio.verified && <VerifiedBadge small />} · {p.studio.country} · reputation {p.studio.reputation ?? '—'}</div></div>
          <dl className="grid grid-cols-3 gap-x-5 gap-y-1 text-center text-xs sm:grid-cols-5">{[['Players', compact(p.players)], ['Wishlist', compact(p.wishlist)], ['Completion', p.demoCompletionPct != null ? `${p.demoCompletionPct}%` : '—'], ['Growth', p.monthlyGrowthPct != null ? `${p.monthlyGrowthPct > 0 ? '+' : ''}${p.monthlyGrowthPct}%` : '—'], ['Funding', p.fundingPct != null ? `${p.fundingPct}%` : '—']].map(([l, v]) => <div key={l}><dt className="text-slate-500">{l}</dt><dd className="font-display text-base font-bold text-white">{v}</dd></div>)}</dl>
          <button className="btn-primary !py-2" onClick={() => { setTarget(p); setMsg(''); setOut(null); }}>Request contact</button>
        </div>))}{rows.length === 0 && <p className="card p-8 text-center text-sm text-slate-500">No projects match.</p>}</div>}
      <Modal open={!!target} onClose={() => setTarget(null)} title={`Contact ${target?.studio.name}`}>
        {out && <Alert tone={out.t}>{out.m}</Alert>}
        <div className="space-y-3"><Field label="Message"><textarea rows={5} className="input" minLength={20} maxLength={2000} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Introduce your company and what you're interested in…" /></Field><button className="btn-primary w-full" disabled={msg.length < 20 || out?.t === 'ok'} onClick={send}>Send request</button></div>
      </Modal>
    </div>
  );
}
