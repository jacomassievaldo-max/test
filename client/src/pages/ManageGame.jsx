import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { errMsg, money } from '../api';
import { Alert, Field, Spinner, useTitle } from '../components/ui';
import { GameForm } from './Submit';

const Section = ({ title, children, hint }) => <section className="card space-y-4 p-5 md:p-6"><div><h2 className="font-display text-lg font-semibold text-white">{title}</h2>{hint && <p className="text-sm text-slate-400">{hint}</p>}</div>{children}</section>;

function useAction() {
  const [msg, setMsg] = useState(null);
  const run = async (fn, ok = 'Done') => { setMsg(null); try { await fn(); setMsg({ t: 'ok', m: ok }); return true; } catch (e) { setMsg({ t: 'error', m: errMsg(e) }); return false; } };
  return [msg, run];
}

function Media({ g, reload }) {
  const [msg, run] = useAction();
  const upload = (type) => (e) => { const file = e.target.files[0]; if (!file) return; const fd = new FormData(); fd.append('file', file); fd.append('type', type); run(async () => { await api.post(`/dev/games/${g.id}/media`, fd); await reload(); }, 'Uploaded'); e.target.value = ''; };
  const [trailer, setTrailer] = useState(g.trailerUrl ?? '');
  return (
    <Section title="Media" hint="PNG, JPG, WebP or GIF up to 8 MB. Files are verified server-side.">
      {msg && <Alert tone={msg.t}>{msg.m}</Alert>}
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Cover image"><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={upload('COVER')} className="input" /></Field>
        <Field label="Add screenshot"><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={upload('SCREENSHOT')} className="input" /></Field>
      </div>
      {g.media.length > 0 && <div className="flex flex-wrap gap-3">{g.media.map((m) => <div key={m.id} className="relative"><img src={m.url} alt="" className="h-20 rounded-lg border border-ink-500" /><span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[10px]">{m.type}</span><button aria-label="Remove" className="absolute -right-2 -top-2 grid h-5 w-5 place-items-center rounded-full bg-danger text-xs text-white" onClick={() => run(async () => { await api.delete(`/dev/games/${g.id}/media/${m.id}`); await reload(); }, 'Removed')}>×</button></div>)}</div>}
      <div className="flex gap-2"><input className="input" type="url" placeholder="Trailer: YouTube or Vimeo link" value={trailer} onChange={(e) => setTrailer(e.target.value)} /><button className="btn-ghost shrink-0" onClick={() => run(async () => { await api.put(`/dev/games/${g.id}/trailer`, { url: trailer }); await reload(); }, 'Trailer saved')}>Save</button></div>
    </Section>
  );
}

function Demo({ g, reload }) {
  const [msg, run] = useAction(); const [url, setUrl] = useState(''); const [kind, setKind] = useState('WEBGL');
  const active = g.demos.filter((d) => d.active);
  const up = (e) => { const f = e.target.files[0]; if (!f) return; const fd = new FormData(); fd.append('file', f); fd.append('kind', 'WEBGL'); run(async () => { await api.post(`/dev/games/${g.id}/demo`, fd); await reload(); }, 'Demo uploaded — it runs in a sandboxed frame'); e.target.value = ''; };
  return (
    <Section title="Playable demo" hint="Upload a single-file HTML5/WebGL build, or link a hosted build (https) or a download.">
      {msg && <Alert tone={msg.t}>{msg.m}</Alert>}
      {active.map((d) => <div key={d.id} className="flex items-center justify-between rounded-lg bg-ink-900 p-3 text-sm"><span className="truncate text-slate-300">{d.kind} · v{d.version} · {d.url}</span><button className="text-danger" onClick={() => run(async () => { await api.delete(`/dev/games/${g.id}/demo/${d.id}`); await reload(); }, 'Removed')}>Remove</button></div>)}
      <Field label="Upload HTML5 demo (.html)"><input type="file" accept="text/html,.html" className="input" onChange={up} /></Field>
      <div className="flex flex-wrap gap-2"><select className="input !w-auto" value={kind} onChange={(e) => setKind(e.target.value)}><option value="WEBGL">Hosted web build</option><option value="DOWNLOAD">Download</option></select><input className="input flex-1" type="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} /><button className="btn-ghost" disabled={!url} onClick={() => run(async () => { await api.post(`/dev/games/${g.id}/demo`, { kind, url }); setUrl(''); await reload(); }, 'Demo linked')}>Add link</button></div>
      <p className="text-xs text-slate-500">Demos run inside a sandboxed frame without access to GameVest. For third-party hosted builds, the host must allow embedding.</p>
    </Section>
  );
}

function Updates({ g, reload }) {
  const [msg, run] = useAction(); const [f, setF] = useState({ title: '', body: '', progress: g.progress });
  return (
    <Section title="Development updates" hint="Followers are notified. Regular updates improve your GameVest Score.">
      {msg && <Alert tone={msg.t}>{msg.m}</Alert>}
      <Field label="Title"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
      <Field label="Update"><textarea className="input" rows={3} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
      <Field label={`Progress: ${f.progress}%`}><input type="range" className="w-full accent-[#8b7bff]" min="0" max="100" value={f.progress} onChange={(e) => setF({ ...f, progress: Number(e.target.value) })} /></Field>
      <button className="btn-primary" disabled={f.title.length < 3 || f.body.length < 10} onClick={() => run(async () => { await api.post(`/dev/games/${g.id}/updates`, { ...f, progress: Number(f.progress) }); setF({ ...f, title: '', body: '' }); await reload(); }, 'Update published')}>Publish update</button>
      <ul className="space-y-1 text-sm text-slate-400">{g.updates.slice(0, 5).map((u) => <li key={u.id}>• {u.title}</li>)}</ul>
    </Section>
  );
}

function Backers({ campaignId }) {
  const [rows, setRows] = useState(null); const [msg, run] = useAction();
  const load = useCallback(() => api.get(`/dev/campaigns/${campaignId}/backers`).then((r) => setRows(r.data.backers)), [campaignId]);
  useEffect(() => { load(); }, [load]);
  if (!rows) return null;
  return (
    <div><div className="label">Backers & reward delivery ({rows.length})</div>{msg && <Alert tone={msg.t}>{msg.m}</Alert>}
      <div className="max-h-64 divide-y divide-ink-700 overflow-y-auto rounded-xl bg-ink-900">{rows.length === 0 ? <p className="p-3 text-sm text-slate-500">No backers yet.</p> : rows.map((b) => (
        <div key={b.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm"><span className="text-slate-300">{b.name} · {b.reward} · {money(b.amountCents)}</span>
          {b.delivery === 'PENDING' ? <button className="btn-ghost !px-2.5 !py-1 !text-xs" onClick={() => run(async () => { await api.post(`/dev/backings/${b.id}/delivered`); await load(); }, 'Marked as delivered')}>Mark delivered</button> : <span className="text-xs text-slate-500">{b.delivery === 'DELIVERED' ? '✓ delivered' : '—'}</span>}</div>))}</div></div>
  );
}

function CampaignSection({ g, reload }) {
  const [msg, run] = useAction(); const camp = g.campaigns[0];
  const [f, setF] = useState({ title: `Back ${g.title}`, summary: '', goal: 50000, days: 30, milestones: 'Prototype, Alpha, Beta, Release', termsText: '' });
  const [rewards, setRewards] = useState([{ title: 'SUPPORTER', description: 'Your name on the supporters page.', price: 20, kind: 'SUPPORT', limit: '' }, { title: 'GAME COPY', description: 'A copy of the game on release, per campaign terms.', price: 50, kind: 'GAME_COPY', limit: '' }]);
  const setR = (i, k, v) => setRewards(rewards.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const create = () => run(async () => {
    await api.post('/dev/campaigns', { gameId: g.id, title: f.title, summary: f.summary || undefined, goalCents: Math.round(f.goal * 100), durationDays: Number(f.days), termsText: f.termsText || undefined, milestones: f.milestones.split(',').map((s) => s.trim()).filter(Boolean), rewards: rewards.map((r) => ({ title: r.title, description: r.description || undefined, priceCents: Math.round(r.price * 100), kind: r.kind, limit: r.limit ? Number(r.limit) : undefined })) });
    await reload();
  }, 'Campaign draft created');
  if (g.stage === 'RELEASED') return null;
  return (
    <Section title="Funding campaign" hint="Crowdfunding with rewards. Requires a verified studio and a published game; the GameVest team approves each campaign before it goes live.">
      {msg && <Alert tone={msg.t}>{msg.m}</Alert>}
      {camp ? (
        <div className="space-y-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><b className="text-white">{camp.title}</b><span className="chip">{camp.status}{camp.status === 'DRAFT' && ' · awaiting review'}</span></div>
          <div className="text-slate-400">{money(camp.raisedCents)} / {money(camp.goalCents)} · {camp.backersCount} backers · ends {new Date(camp.endsAt).toLocaleDateString()}</div>
          <ul className="space-y-1">{camp.rewards.map((r) => <li key={r.id} className="text-slate-300">{r.title} — {money(r.priceCents)} ({r.claimed}{r.limit ? `/${r.limit}` : ''} claimed)</li>)}</ul>
          {camp.milestones.length > 0 && <div><div className="label">Milestones</div><div className="space-y-2">{camp.milestones.map((m) => <div key={m.id} className="flex items-center justify-between gap-2"><span className="text-white">{m.title}</span><select className="input !w-auto !py-1.5" value={m.status} onChange={(e) => run(async () => { await api.put(`/dev/campaigns/${camp.id}/milestones/${m.id}`, { status: e.target.value }); await reload(); }, 'Milestone updated')}><option value="PENDING">Pending</option><option value="IN_PROGRESS">In progress</option><option value="DONE">Done</option></select></div>)}</div></div>}
          {camp.adminApproved && <Backers campaignId={camp.id} />}
          {camp.status === 'DRAFT' && <button className="btn-primary" onClick={() => run(() => api.post(`/dev/campaigns/${camp.id}/submit`), 'Submitted for GameVest review')}>Submit campaign for review</button>}</div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3"><Field label="Title"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field><Field label="Goal (R$, min 1.000)"><input type="number" min="1000" className="input" value={f.goal} onChange={(e) => setF({ ...f, goal: Number(e.target.value) })} /></Field><Field label="Duration (7–60 days)"><input type="number" min="7" max="60" className="input" value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })} /></Field></div>
          <Field label="Summary"><textarea rows={3} className="input" value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} /></Field>
          <Field label="Milestones (comma-separated)"><input className="input" value={f.milestones} onChange={(e) => setF({ ...f, milestones: e.target.value })} /></Field>
          <div><div className="label">Reward tiers</div><div className="space-y-2">{rewards.map((r, i) => <div key={i} className="grid gap-2 rounded-xl bg-ink-900 p-3 md:grid-cols-[1fr_90px_140px_90px_auto]"><input className="input" placeholder="Title" value={r.title} onChange={(e) => setR(i, 'title', e.target.value)} /><input className="input" type="number" min="5" placeholder="R$" value={r.price} onChange={(e) => setR(i, 'price', Number(e.target.value))} /><select className="input" value={r.kind} onChange={(e) => setR(i, 'kind', e.target.value)}>{['SUPPORT', 'GAME_COPY', 'BUNDLE', 'EARLY_ACCESS', 'FOUNDER'].map((k) => <option key={k}>{k}</option>)}</select><input className="input" type="number" placeholder="Limit" value={r.limit} onChange={(e) => setR(i, 'limit', e.target.value)} /><button className="text-danger" onClick={() => setRewards(rewards.filter((_, j) => j !== i))} aria-label="Remove tier">✕</button><input className="input md:col-span-5" placeholder="Description" value={r.description} onChange={(e) => setR(i, 'description', e.target.value)} /></div>)}</div>
            {rewards.length < 12 && <button className="mt-2 text-sm text-brand-soft" onClick={() => setRewards([...rewards, { title: '', description: '', price: 100, kind: 'BUNDLE', limit: '' }])}>+ Add tier</button>}</div>
          <Field label="Campaign terms shown to backers (delivery, timeline, risks)"><textarea rows={3} className="input" maxLength={3000} value={f.termsText} onChange={(e) => setF({ ...f, termsText: e.target.value })} /></Field>
          <Alert tone="warn">Pledges are rewards-based support, not investment. Do not promise financial returns, equity or profit sharing — campaigns that do will be removed.</Alert>
          <button className="btn-primary" onClick={create}>Create campaign draft</button></div>
      )}
    </Section>
  );
}

export default function ManageGame() {
  const { id } = useParams(); const [g, setG] = useState(null); const [msg, run] = useAction();
  const reload = useCallback(() => api.get(`/dev/games/${id}`).then((r) => setG(r.data.game)), [id]);
  useEffect(() => { reload(); }, [reload]);
  useTitle(g?.title);
  if (!g) return <Spinner />;
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 md:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><Link to="/developer" className="text-sm text-slate-500 hover:text-white">← Developer Hub</Link><h1 className="font-display text-3xl font-bold text-white">{g.title}</h1></div>
        <div className="flex items-center gap-2"><span className="chip">{g.status}</span>{g.status === 'PUBLISHED' && <Link className="btn-ghost" to={`/games/${g.slug}`}>View page</Link>}</div></div>
      {g.rejectionNote && <Alert tone="error">Changes requested: {g.rejectionNote}</Alert>}
      {msg && <Alert tone={msg.t}>{msg.m}</Alert>}
      {['DRAFT', 'REJECTED'].includes(g.status) && <Alert tone="info">Add a cover or screenshot, then submit for review. Our team checks every project for originality and accuracy before it's published. <button className="ml-2 font-semibold underline" onClick={() => run(async () => { await api.post(`/dev/games/${g.id}/submit`); await reload(); }, 'Submitted for review')}>Submit for review</button></Alert>}
      {g.status === 'PENDING' && <Alert tone="warn">Under review by the GameVest team.</Alert>}
      <Section title="Game details"><GameForm submitLabel="Save changes" initial={{ ...g, price: g.priceCents / 100, tagline: g.tagline ?? '', estimatedRelease: g.estimatedRelease ?? '', trailerUrl: g.trailerUrl ?? '', ageRating: g.ageRating ?? '' }} onSaved={async (body) => { await api.put(`/dev/games/${g.id}`, body); await reload(); }} /></Section>
      <Media g={g} reload={reload} /><Demo g={g} reload={reload} /><Updates g={g} reload={reload} /><CampaignSection g={g} reload={reload} />
    </div>
  );
}
