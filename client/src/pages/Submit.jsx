import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { errMsg } from '../api';
import { Alert, Field, useTitle } from '../components/ui';

const STAGES = ['CONCEPT', 'PROTOTYPE', 'ALPHA', 'BETA', 'EARLY_ACCESS', 'RELEASED'];

export function GameForm({ initial, onSaved, submitLabel = 'Save' }) {
  const [meta, setMeta] = useState({ genres: [], platforms: [] });
  const [f, setF] = useState(() => ({ title: '', tagline: '', description: '', genres: [], platforms: ['Windows'], stage: 'PROTOTYPE', progress: 10, price: 0, estimatedRelease: '', trailerUrl: '', ageRating: '', ...initial }));
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [ok, setOk] = useState(false);
  useEffect(() => { api.get('/meta').then((r) => setMeta(r.data)); }, []);
  const tog = (k, v) => setF((s) => ({ ...s, [k]: s[k].includes(v) ? s[k].filter((x) => x !== v) : [...s[k], v] }));
  const u = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true); setOk(false);
    const body = { title: f.title, tagline: f.tagline || undefined, description: f.description, genres: f.genres, platforms: f.platforms, stage: f.stage, progress: Number(f.progress), priceCents: Math.round(Number(f.price || 0) * 100), estimatedRelease: f.estimatedRelease || undefined, trailerUrl: f.trailerUrl || '', ageRating: f.ageRating || undefined };
    try { await onSaved(body); setOk(true); } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-5">
      {err && <Alert tone="error">{err}</Alert>}{ok && <Alert tone="ok">Saved.</Alert>}
      <div className="grid gap-4 md:grid-cols-2"><Field label="Game title"><input className="input" required minLength={2} maxLength={80} value={f.title} onChange={u('title')} /></Field><Field label="Tagline"><input className="input" maxLength={140} value={f.tagline} onChange={u('tagline')} /></Field></div>
      <Field label="Description" hint="Be accurate: misleading descriptions can lead to removal and affect your reputation."><textarea className="input" rows={6} required minLength={20} maxLength={8000} value={f.description} onChange={u('description')} /></Field>
      <div><div className="label">Genres (up to 4)</div><div className="flex flex-wrap gap-1.5">{meta.genres.map((g) => <button type="button" key={g} aria-pressed={f.genres.includes(g)} onClick={() => tog('genres', g)} className={`chip ${f.genres.includes(g) ? 'chip-on' : ''}`}>{g}</button>)}</div></div>
      <div><div className="label">Platforms</div><div className="flex flex-wrap gap-1.5">{meta.platforms.map((g) => <button type="button" key={g} aria-pressed={f.platforms.includes(g)} onClick={() => tog('platforms', g)} className={`chip ${f.platforms.includes(g) ? 'chip-on' : ''}`}>{g}</button>)}</div></div>
      <div className="grid gap-4 md:grid-cols-4">
        <Field label="Development stage"><select className="input" value={f.stage} onChange={u('stage')}>{STAGES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select></Field>
        <Field label={`Progress: ${f.progress}%`}><input type="range" min="0" max="100" className="w-full accent-[#8b7bff]" value={f.progress} onChange={u('progress')} /></Field>
        <Field label="Price (R$, 0 = free)"><input type="number" min="0" step="0.01" className="input" value={f.price} onChange={u('price')} /></Field>
        <Field label="Estimated release"><input className="input" placeholder="Q3 2027" maxLength={30} value={f.estimatedRelease} onChange={u('estimatedRelease')} /></Field>
      </div>
      <div className="grid gap-4 md:grid-cols-2"><Field label="Trailer (YouTube or Vimeo link)"><input type="url" className="input" placeholder="https://www.youtube.com/watch?v=…" value={f.trailerUrl} onChange={u('trailerUrl')} /></Field><Field label="Age rating"><input className="input" placeholder="12" maxLength={10} value={f.ageRating} onChange={u('ageRating')} /></Field></div>
      <button className="btn-primary" disabled={busy || !f.genres.length || !f.platforms.length}>{busy ? 'Saving…' : submitLabel}</button>
    </form>
  );
}

export default function Submit() {
  useTitle('Submit your game'); const nav = useNavigate();
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:py-10">
      <h1 className="font-display text-3xl font-bold text-white">Submit your game</h1>
      <p className="mb-6 mt-1 text-slate-400">Step 1 of 3 — basics. Next you'll add media and a demo, then send it for review.</p>
      <div className="card p-5 md:p-7"><GameForm submitLabel="Create game & continue" onSaved={async (body) => { const { data } = await api.post('/dev/games', body); nav(`/developer/games/${data.game.id}`); }} /></div>
    </div>
  );
}
