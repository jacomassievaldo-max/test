import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth';
import api, { ago, compact, errMsg, money, num, STAGE } from '../api';
import { Alert, Bar, Field, GameCover, Modal, ProtectedBadge, SCORE_LABEL, ScoreBadge, Spinner, StageBadge, Stars, VerifiedBadge, scoreTone, useTitle } from '../components/ui';

const embed = (u) => {
  if (!u) return null;
  const y = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/); if (y) return `https://www.youtube-nocookie.com/embed/${y[1]}`;
  const v = u.match(/vimeo\.com\/(?:video\/)?(\d+)/); if (v) return `https://player.vimeo.com/video/${v[1]}`;
  return null;
};

/* ---------------- demo player + post-play survey ---------------- */
function DemoModal({ game, demo, onClose, onFinished }) {
  const { user } = useAuth();
  const [session, setSession] = useState(null); const [phase, setPhase] = useState('play'); const [err, setErr] = useState('');
  const t0 = useRef(Date.now()); const frame = useRef(null); const done = useRef(false);
  const [fb, setFb] = useState({ rating: 0, wouldPlayAgain: null, wouldBuy: null, price: '', improve: '' });
  const elapsed = () => Math.floor((Date.now() - t0.current) / 1000);

  useEffect(() => {
    api.post(`/games/${game.slug}/demo/start`).then((r) => setSession(r.data.sessionId)).catch((e) => setErr(errMsg(e)));
  }, [game.slug]);
  useEffect(() => {
    if (!session) return;
    const beat = () => api.post(`/demo/${session}/heartbeat`, { durationSec: elapsed(), completed: done.current }).catch(() => {});
    const id = setInterval(beat, 10000);
    const onMsg = (e) => { if (e.source === frame.current?.contentWindow && e.data?.gamevest === 'complete') { done.current = true; beat(); setPhase('survey'); } };
    window.addEventListener('message', onMsg);
    return () => { clearInterval(id); window.removeEventListener('message', onMsg); };
  }, [session]);

  const finish = async () => { if (session) await api.post(`/demo/${session}/heartbeat`, { durationSec: elapsed(), completed: done.current }).catch(() => {}); setPhase(elapsed() >= 20 ? 'survey' : 'closed'); if (elapsed() < 20) onClose(); };
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    if (!fb.rating || fb.wouldPlayAgain === null || fb.wouldBuy === null) return setErr('Please answer the first three questions.');
    try { await api.post(`/demo/${session}/feedback`, { rating: fb.rating, wouldPlayAgain: fb.wouldPlayAgain, wouldBuy: fb.wouldBuy, priceCents: fb.price !== '' ? Math.round(Number(fb.price) * 100) : undefined, improve: fb.improve || undefined }); onFinished?.(); setPhase('thanks'); } catch (x) { setErr(errMsg(x)); }
  };
  const YN = ({ k }) => <div className="flex gap-2">{[[true, 'Yes'], [false, 'No']].map(([v, l]) => <button type="button" key={l} onClick={() => setFb({ ...fb, [k]: v })} aria-pressed={fb[k] === v} className={`chip !px-4 !py-1.5 ${fb[k] === v ? 'chip-on' : ''}`}>{l}</button>)}</div>;

  if (phase === 'play') return (
    <Modal open onClose={finish} title={`Playing: ${game.title}`} wide>
      {err && <Alert tone="error">{err}</Alert>}
      {demo.kind === 'WEBGL' ? (
        <div className="overflow-hidden rounded-xl border border-ink-500 bg-black">
          {/* sandbox WITHOUT allow-same-origin: the demo cannot touch GameVest cookies or storage */}
          <iframe ref={frame} title={`${game.title} demo`} src={demo.url} sandbox="allow-scripts allow-pointer-lock" allow="fullscreen" className="h-[55vh] w-full" />
        </div>
      ) : (
        <div className="space-y-3 rounded-xl bg-ink-900 p-5"><p className="text-sm text-slate-300">This demo is a downloadable build hosted by the developer. Only run files from developers you trust.</p><a className="btn-primary" href={demo.url} target="_blank" rel="noopener noreferrer" onClick={() => setTimeout(() => {}, 0)}>Download demo v{demo.version}</a></div>
      )}
      <div className="mt-4 flex justify-between text-xs text-slate-500"><span>{user ? 'Your session counts toward your library and review eligibility.' : 'Sign in to keep this demo in your library.'}</span><button className="btn-ghost !py-1.5" onClick={finish}>Finish & rate</button></div>
    </Modal>
  );
  if (phase === 'survey') return (
    <Modal open onClose={onClose} title="Did you enjoy this game?">
      <form onSubmit={submit} className="space-y-5">
        {err && <Alert tone="error">{err}</Alert>}
        <div><div className="label">Your rating</div><div className="flex gap-1" role="radiogroup" aria-label="Rating">{[1, 2, 3, 4, 5].map((n) => <button type="button" key={n} role="radio" aria-checked={fb.rating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => setFb({ ...fb, rating: n })} className={`text-3xl transition ${n <= fb.rating ? 'text-amber' : 'text-ink-500 hover:text-amber/60'}`}>★</button>)}</div></div>
        <div><div className="label">Would you play again?</div><YN k="wouldPlayAgain" /></div>
        <div><div className="label">Would you buy this game?</div><YN k="wouldBuy" /></div>
        <Field label="What price would you pay? (R$, optional)"><input type="number" min="0" max="1000" className="input" value={fb.price} onChange={(e) => setFb({ ...fb, price: e.target.value })} /></Field>
        <Field label="What should the developer improve? (optional)"><textarea maxLength={500} rows={3} className="input" value={fb.improve} onChange={(e) => setFb({ ...fb, improve: e.target.value })} /></Field>
        <p className="text-xs text-slate-500">Developers only see anonymized, aggregated results.</p>
        <div className="flex gap-2"><button className="btn-primary flex-1">Send feedback</button><button type="button" className="btn-ghost" onClick={onClose}>Skip</button></div>
      </form>
    </Modal>
  );
  return <Modal open onClose={onClose} title="Thank you! 🎮"><p className="text-sm text-slate-300">Your feedback helps {game.studio.name} improve {game.title}.</p><button className="btn-primary mt-4" onClick={onClose}>Close</button></Modal>;
}

/* ---------------- back / buy flow (terms + refund policy shown BEFORE paying) ---------------- */
function CheckoutModal({ mode, game, campaign, dlc, onClose, onDone }) {
  const nav = useNavigate(); const { user } = useAuth();
  const [meta, setMeta] = useState(null); const [policies, setPolicies] = useState([]);
  const [reward, setReward] = useState(null); const [amount, setAmount] = useState(''); const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [step, setStep] = useState('form');
  useEffect(() => { api.get('/meta').then((r) => setMeta(r.data)); api.get('/policies/refund').then((r) => setPolicies(r.data.policies)); }, []);
  const scope = mode === 'back' ? 'CROWDFUNDING' : dlc ? 'DLC' : game.stage === 'EARLY_ACCESS' ? 'EARLY_ACCESS' : 'RELEASED_GAME';
  const policy = policies.find((p) => p.scope === scope);
  const price = mode === 'back' ? Math.round(Number(amount || 0) * 100) : (dlc?.priceCents ?? game.priceCents);
  const pick = (r) => { setReward(r); setAmount(String(r.priceCents / 100)); };

  const pay = async () => {
    setBusy(true); setErr('');
    try {
      const body = { acceptTerms: true, termsVersion: meta.termsVersion };
      const { data } = mode === 'back'
        ? await api.post(`/campaigns/${campaign.id}/back`, { ...body, rewardId: reward?.id, amountCents: price })
        : await api.post(`/store/games/${game.slug}/buy`, { ...body, dlcId: dlc?.id });
      if (data.free) { setStep('done'); return; }
      if (data.requiresConfirm) setStep('provider'); else if (data.checkoutUrl) window.location.href = data.checkoutUrl;
      setTx(data.transactionId);
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };
  const [tx, setTx] = useState(null);
  const confirmMock = async (fail) => {
    setBusy(true);
    try { await api.post(`/payments/mock/${tx}/confirm`, { fail }); if (fail) setErr('Payment failed (simulated).'); else setStep('done'); } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  if (!user) return <Modal open onClose={onClose} title="Sign in required"><p className="text-sm text-slate-300">Create an account or sign in to continue.</p><div className="mt-4 flex gap-2"><button className="btn-primary" onClick={() => nav(`/login?next=/games/${game.slug}`)}>Sign in</button><button className="btn-ghost" onClick={() => nav('/register')}>Create account</button></div></Modal>;
  if (step === 'done') return <Modal open onClose={() => { onDone(); onClose(); }} title="All set 🎉"><p className="text-sm text-slate-300">{mode === 'back' ? `You're now backing ${game.title}. Your pledge and the terms you accepted are recorded.` : `${dlc?.title ?? game.title} was added to your library.`}</p><div className="mt-4 flex gap-2"><button className="btn-primary" onClick={() => { onDone(); nav('/library'); }}>Open library</button><button className="btn-ghost" onClick={() => { onDone(); onClose(); }}>Close</button></div></Modal>;
  if (step === 'provider') return (
    <Modal open onClose={onClose} title="Secure payment">
      <div className="space-y-4"><Alert tone="info">Development mode: payments use a simulated provider. In production, you'd be redirected to our payment partner's hosted checkout — GameVest never sees or stores your card data.</Alert>
        <div className="rounded-xl bg-ink-900 p-4 text-sm"><div className="flex justify-between"><span className="text-slate-400">Total</span><span className="font-display text-lg font-bold text-white">{money(price, { exact: true })}</span></div></div>
        {err && <Alert tone="error">{err}</Alert>}
        <div className="flex gap-2"><button className="btn-primary flex-1" disabled={busy} onClick={() => confirmMock(false)}>Simulate successful payment</button><button className="btn-ghost" disabled={busy} onClick={() => confirmMock(true)}>Fail</button></div></div>
    </Modal>
  );
  return (
    <Modal open onClose={onClose} title={mode === 'back' ? `Back ${game.title}` : `Buy ${dlc?.title ?? game.title}`}>
      <div className="space-y-4">
        {mode === 'back' && (
          <div className="space-y-2"><div className="label">Choose a reward</div>
            {campaign.rewards.map((r) => { const out = r.limit != null && r.claimed >= r.limit; return (
              <button key={r.id} disabled={out} onClick={() => pick(r)} aria-pressed={reward?.id === r.id} className={`w-full rounded-xl border p-3 text-left transition disabled:opacity-40 ${reward?.id === r.id ? 'border-brand bg-brand/10' : 'border-ink-500 hover:border-slate-400'}`}>
                <div className="flex justify-between"><span className="font-display font-semibold text-white">{r.title}</span><span className="font-semibold text-brand-soft">{money(r.priceCents)}</span></div>
                <div className="text-xs text-slate-400">{r.description}</div>{r.limit != null && <div className="mt-1 text-[11px] text-slate-500">{out ? 'Sold out' : `${r.limit - r.claimed} left`}</div>}</button>); })}
            <Field label="Pledge amount (R$)" hint={reward ? `Minimum for this reward: ${money(reward.priceCents)}` : 'Minimum R$ 5. Pledging without a reward supports the project only.'}><input className="input" type="number" min={reward ? reward.priceCents / 100 : 5} step="1" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field></div>
        )}
        {mode === 'buy' && <div className="rounded-xl bg-ink-900 p-4"><div className="flex justify-between"><span className="text-slate-300">{dlc?.title ?? game.title}</span><span className="font-display text-lg font-bold text-white">{money(price, { exact: true })}</span></div></div>}
        {policy && <div className="rounded-xl border border-ink-500 p-3 text-xs leading-relaxed text-slate-300"><b className="text-white">Refund policy — {scope.replaceAll('_', ' ').toLowerCase()}:</b> {policy.summary} <Link className="text-brand-soft underline" to="/trust#refunds" target="_blank">All policies</Link></div>}
        {mode === 'back' && <Alert tone="warn">This is crowdfunding with rewards, not an investment. {game.title} is under development: features, content and release dates may change, and the project may not be completed. No financial return is promised.</Alert>}
        <label className="flex items-start gap-2 text-sm text-slate-300"><input type="checkbox" className="mt-1 h-4 w-4 accent-[#8b7bff]" checked={ok} onChange={(e) => setOk(e.target.checked)} /><span>I have read and accept the terms (v{meta?.termsVersion}){mode === 'back' && campaign.termsText ? ` and the campaign terms: “${campaign.termsText}”` : ''} and the refund policy above.</span></label>
        {err && <Alert tone="error">{err}</Alert>}
        <button className="btn-primary w-full !py-3" disabled={!ok || busy || !meta || price < (mode === 'back' ? 500 : 1) || (mode === 'back' && reward && price < reward.priceCents)} onClick={pay}>{busy ? 'Processing…' : `Continue to payment · ${money(price, { exact: true })}`}</button>
      </div>
    </Modal>
  );
}

function ReportModal({ game, onClose }) {
  const [reason, setReason] = useState('SCAM'); const [details, setDetails] = useState(''); const [msg, setMsg] = useState(null);
  const submit = async (e) => { e.preventDefault(); try { await api.post('/reports', { gameId: game.id, reason, details: details || undefined }); setMsg({ t: 'ok', m: 'Thank you. Our team will review this report.' }); } catch (x) { setMsg({ t: 'error', m: errMsg(x) }); } };
  return (
    <Modal open onClose={onClose} title="Report project">
      <form onSubmit={submit} className="space-y-4">{msg && <Alert tone={msg.t}>{msg.m}</Alert>}
        <Field label="Reason"><select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>{[['SCAM', 'Scam'], ['STOLEN_CONTENT', 'Stolen Content'], ['FAKE_DEVELOPER', 'Fake Developer'], ['MISLEADING', 'Misleading Information'], ['ABANDONED', 'Abandoned Project'], ['OTHER', 'Other']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Details"><textarea rows={4} maxLength={1500} className="input" value={details} onChange={(e) => setDetails(e.target.value)} /></Field>
        <button className="btn-danger w-full" disabled={msg?.t === 'ok'}>Submit report</button></form>
    </Modal>
  );
}

/* ---------------- score breakdown ---------------- */
function ScoreCard({ s }) {
  if (!s) return null;
  const parts = [['Gameplay', s.gameplay], ['Community', s.community], ['Growth', s.growth], ['Funding', s.funding], ['Development', s.development]];
  return (
    <div className="card p-5"><div className="flex items-center justify-between"><div><div className="text-xs uppercase tracking-wide text-slate-500">GameVest Score</div><div className="font-display text-4xl font-bold text-white">{s.total}<span className="text-lg text-slate-500">/100</span></div></div>
      <span className={`rounded-lg border px-3 py-1.5 text-xs font-bold tracking-wide ${scoreTone(s.total)}`}>{s.total >= 80 ? '🟢' : s.total >= 60 ? '🟣' : s.total >= 40 ? '🟡' : '⚪'} {SCORE_LABEL[s.label]?.toUpperCase()}</span></div>
      <div className="mt-4 space-y-2.5">{parts.map(([l, v]) => <div key={l} className="grid grid-cols-[88px_1fr_28px] items-center gap-3 text-xs"><span className="text-slate-400">{l}</span>{l === 'Funding' && !v ? <span className="text-slate-600">no campaign</span> : <Bar pct={v} tone={v >= 80 ? 'mint' : 'brand'} height="h-1.5" label={l} />}<span className="text-right font-semibold text-slate-200">{l === 'Funding' && !v ? '–' : v}</span></div>)}</div>
      <p className="mt-4 text-[11px] leading-relaxed text-slate-500">An engagement indicator based on demo play, retention, reviews, wishlist, growth, funding and progress. It is not a guarantee of commercial success or financial return.</p></div>
  );
}

/* ---------------- page ---------------- */
export default function GamePage() {
  const { slug } = useParams(); const { user } = useAuth(); const nav = useNavigate();
  const [g, setG] = useState(null); const [err, setErr] = useState('');
  const [tab, setTab] = useState('overview'); const [modal, setModal] = useState(null);
  const [reviews, setReviews] = useState([]); const [comments, setComments] = useState([]);
  const load = useCallback(() => api.get(`/games/${slug}`).then((r) => setG(r.data)).catch((e) => setErr(errMsg(e))), [slug]);
  const loadSocial = useCallback(() => { api.get(`/games/${slug}/reviews`).then((r) => setReviews(r.data.reviews)); api.get(`/games/${slug}/comments`).then((r) => setComments(r.data.comments)); }, [slug]);
  useEffect(() => { setG(null); load(); loadSocial(); api.post(`/games/${slug}/view`).catch(() => {}); }, [slug, load, loadSocial]);
  useTitle(g?.title);
  const needAuth = (fn) => () => (user ? fn() : nav(`/login?next=/games/${slug}`));
  const toggle = (k) => needAuth(async () => { await api.post(`/games/${slug}/${k}`); load(); })();

  if (err) return <div className="p-16 text-center text-slate-400">{err}</div>;
  if (!g) return <Spinner />;
  const c = g.campaign; const demo = g.demos.find((d) => d.kind === 'WEBGL') ?? g.demos[0]; const trailer = embed(g.trailerUrl);
  const onSale = ['RELEASED', 'EARLY_ACCESS'].includes(g.stage);
  const liveCamp = c && c.status === 'ACTIVE' && c.adminApproved && new Date(c.endsAt) > new Date();
  const shots = g.media.filter((m) => m.type === 'SCREENSHOT');
  const isOwnerView = g.status !== 'PUBLISHED';
  const me = g.me;

  return (
    <div className="pb-10">
      {isOwnerView && <div className="px-4 pt-4"><Alert tone="warn">This page is not public yet — status: <b>{g.status}</b>{g.rejectionNote && ` · ${g.rejectionNote}`}</Alert></div>}
      <div className="relative">
        <GameCover game={g} title={false} className="h-56 w-full opacity-70 md:h-72 md:rounded-b-3xl" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/50 to-transparent" />
      </div>
      <div className="relative -mt-24 space-y-6 px-4 md:-mt-28">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {g.trendRank && g.trendRank <= 10 && <span className="rounded-md bg-orange-500/15 px-2 py-0.5 text-xs font-bold text-orange-300">🔥 Trending #{g.trendRank}</span>}
            <StageBadge stage={g.stage} />{g.sponsored && <span className="rounded-md bg-amber px-2 py-0.5 text-[11px] font-bold text-ink-950">SPONSORED</span>}
            {g.protectedBy && <ProtectedBadge small />}
          </div>
          <h1 className="font-display text-4xl font-bold uppercase leading-none text-white md:text-6xl">{g.title}</h1>
          <p className="max-w-2xl text-slate-300">{g.tagline}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-400">
            <Link to={`/studios/${g.studio.slug}`} className="font-medium text-white hover:underline">{g.studio.name}</Link>{g.studio.verified && <VerifiedBadge small />}
            <span>{g.genres.join(' · ')}</span><span>{g.platforms.join(' / ')}</span>{g.ageRating && <span className="rounded border border-ink-500 px-1.5 text-xs">{g.ageRating}+</span>}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="min-w-0 space-y-6">
            <div className="aspect-video overflow-hidden rounded-2xl border border-ink-600 bg-black">
              {trailer ? <iframe className="h-full w-full" src={trailer} title={`${g.title} trailer`} allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-presentation" /> : <GameCover game={g} className="h-full w-full" />}
            </div>
            {shots.length > 0 && <div className="no-scrollbar flex gap-3 overflow-x-auto">{shots.map((m) => <img key={m.id} src={m.url} alt={m.caption || `${g.title} screenshot`} loading="lazy" className="h-28 rounded-lg border border-ink-600" />)}</div>}

            {g.riskNotice && <Alert tone="warn">⚠ {g.riskNotice}</Alert>}

            <div role="tablist" className="no-scrollbar flex gap-1 overflow-x-auto border-b border-ink-600">{[['overview', 'Overview'], ['roadmap', 'Roadmap & updates'], ['reviews', `Reviews (${g.ratingCount})`], ['community', `Comments (${comments.length})`], ['specs', 'Requirements']].map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium ${tab === k ? 'border-brand text-white' : 'border-transparent text-slate-400 hover:text-white'}`}>{l}</button>)}</div>

            {tab === 'overview' && (
              <div className="space-y-6">
                <p className="whitespace-pre-line leading-relaxed text-slate-300">{g.description}</p>
                {g.dlcs.length > 0 && <div className="card p-5"><h3 className="mb-3 font-display text-lg font-semibold text-white">DLC</h3>{g.dlcs.map((d) => <div key={d.id} className="flex items-center justify-between border-t border-ink-600 py-3 first:border-0"><span className="text-white">{d.title}</span><button className="btn-ghost !py-1.5" onClick={needAuth(() => setModal({ t: 'dlc', dlc: d }))}>{money(d.priceCents, { exact: true })}</button></div>)}</div>}
                <div className="card p-5"><h3 className="mb-3 font-display text-lg font-semibold text-white">Project transparency</h3>
                  <dl className="grid gap-4 text-sm sm:grid-cols-2">
                    <div><dt className="text-xs text-slate-500">Developer</dt><dd className="text-white">{g.studio.verified ? <VerifiedBadge small /> : <span className="text-slate-400">Identity not verified</span>}</dd></div>
                    <div><dt className="text-xs text-slate-500">Development</dt><dd className="text-white">{STAGE[g.stage]} — {g.progress}%</dd></div>
                    <div><dt className="text-xs text-slate-500">Last update</dt><dd className="text-white">{ago(g.lastUpdateAt)}</dd></div>
                    {c && <div><dt className="text-xs text-slate-500">Funding</dt><dd className="text-white">{money(c.raisedCents)} / {money(c.goalCents)}</dd></div>}
                    <div><dt className="text-xs text-slate-500">Estimated release</dt><dd className="text-white">{g.estimatedRelease || 'To be announced'}</dd></div>
                    <div><dt className="text-xs text-slate-500">GameVest Protection</dt><dd className="text-white">{g.protectedBy ? <ProtectedBadge small /> : <span className="text-slate-400">Not enrolled</span>}</dd></div>
                  </dl></div>
              </div>
            )}

            {tab === 'roadmap' && (
              <div className="space-y-6">
                {c?.milestones?.length > 0 && <div className="card p-5"><h3 className="mb-4 font-display text-lg font-semibold text-white">Milestones</h3><ol className="space-y-3">{c.milestones.map((m) => <li key={m.id} className="flex items-center gap-3"><span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${m.status === 'DONE' ? 'bg-mint text-ink-950' : m.status === 'IN_PROGRESS' ? 'bg-brand text-ink-950' : 'bg-ink-600 text-slate-400'}`}>{m.status === 'DONE' ? '✓' : m.order + 1}</span><span className="text-white">{m.title}</span><span className="text-xs text-slate-500">{m.status === 'DONE' ? '✓ Complete' : m.status === 'IN_PROGRESS' ? 'In progress' : 'Pending'}</span></li>)}</ol><p className="mt-4 text-[11px] text-slate-500">Milestones show project progress. Funds are not held in escrow.</p></div>}
                <div className="space-y-3"><h3 className="font-display text-lg font-semibold text-white">Development updates</h3>{g.updates.length === 0 ? <p className="text-sm text-slate-500">No updates yet.</p> : g.updates.map((u) => <article key={u.id} className="card p-4"><div className="text-xs text-slate-500">{ago(u.createdAt)}</div><h4 className="font-semibold text-white">{u.title}</h4><p className="mt-1 whitespace-pre-line text-sm text-slate-300">{u.body}</p></article>)}</div>
                <div className="card p-5"><h3 className="mb-2 font-display text-lg font-semibold text-white">Project history</h3><ul className="space-y-1 text-sm text-slate-400"><li>Listed on GameVest {ago(g.createdAt)}</li><li>Current stage: {STAGE[g.stage]} ({g.progress}% complete)</li>{c && <li>Campaign “{c.title}”: {c.backersCount} backers, {money(c.raisedCents)} raised</li>}</ul></div>
              </div>
            )}

            {tab === 'reviews' && <Reviews slug={slug} reviews={reviews} mine={me?.review} canWrite={!!user} onChange={() => { loadSocial(); load(); }} />}
            {tab === 'community' && <Comments slug={slug} comments={comments} canWrite={!!user} onChange={loadSocial} />}
            {tab === 'specs' && (
              <div className="grid gap-4 sm:grid-cols-2">{g.requirements.length === 0 ? <p className="text-sm text-slate-500">The developer hasn't listed requirements yet.</p> : g.requirements.map((r) => <div key={r.id} className="card p-5"><h3 className="mb-3 font-display font-semibold text-white">{r.tier === 'MIN' ? 'Minimum' : 'Recommended'}</h3><dl className="space-y-1.5 text-sm">{[['OS', r.os], ['CPU', r.cpu], ['GPU', r.gpu], ['RAM', r.ram], ['Storage', r.storage]].map(([k, v]) => v && <div key={k} className="flex justify-between gap-4"><dt className="text-slate-500">{k}</dt><dd className="text-right text-slate-200">{v}</dd></div>)}</dl></div>)}</div>
            )}
          </div>

          {/* ---------- sticky action column ---------- */}
          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <div className="card space-y-4 p-5">
              <div className="flex items-center justify-between"><div><div className="text-xs text-slate-500">Rating</div><div className="flex items-center gap-2"><Stars value={g.rating} size={16} /><span className="text-xs text-slate-500">({g.ratingCount})</span></div></div><div className="text-right"><div className="text-xs text-slate-500">Followers · Wishlist</div><div className="text-sm font-semibold text-white">{compact(g.followers)} · {compact(g.wishlist)}</div></div></div>
              {g.stage !== 'RELEASED' && <div><div className="mb-1.5 flex justify-between text-xs"><span className="text-slate-400">Development</span><span className="font-semibold text-white">{g.progress}%</span></div><Bar pct={g.progress} label="Development progress" /></div>}
              {c && (c.adminApproved || isOwnerView) && <div>
                <div className="mb-1 flex justify-between text-xs"><span className="text-slate-400">Funding</span><span className="text-slate-400">{Math.round((100 * c.raisedCents) / c.goalCents)}%</span></div>
                <Bar pct={(100 * c.raisedCents) / c.goalCents} tone="mint" label="Funding progress" />
                <div className="mt-2 flex items-baseline justify-between"><span className="font-display text-2xl font-bold text-white">{money(c.raisedCents)}</span><span className="text-xs text-slate-400">of {money(c.goalCents)}</span></div>
                <div className="mt-1 flex justify-between text-xs text-slate-400"><span><b className="text-slate-200">{num(c.backersCount)}</b> backers</span><span>{liveCamp ? <><b className="text-slate-200">{c.daysLeft}</b> days left</> : c.status}</span></div></div>}

              <div className="grid gap-2">
                {demo && <button className="btn-mint !py-3" onClick={() => setModal({ t: 'demo' })}>▶ PLAY DEMO</button>}
                {liveCamp && <button className="btn-primary !py-3" onClick={needAuth(() => setModal({ t: 'back' }))}>BACK THIS GAME</button>}
                {onSale && !me?.owned && <button className="btn-primary !py-3" onClick={needAuth(() => (g.priceCents === 0 ? api.post(`/store/games/${slug}/buy`, { acceptTerms: true, termsVersion: '2026-01' }).then(load) : setModal({ t: 'buy' })))}>{g.priceCents ? `BUY GAME — ${money(g.priceCents, { exact: true })}` : 'GET FOR FREE'}</button>}
                {me?.owned && <Link to="/library" className="btn-ghost">✓ In your library</Link>}
                <div className="grid grid-cols-2 gap-2">
                  <button className={`btn-ghost ${me?.following ? '!border-brand !text-brand-soft' : ''}`} aria-pressed={!!me?.following} onClick={() => toggle('follow')}>{me?.following ? '✓ Following' : '+ FOLLOW'}</button>
                  <button className={`btn-ghost ${me?.wishlisted ? '!border-brand !text-brand-soft' : ''}`} aria-pressed={!!me?.wishlisted} onClick={() => toggle('wishlist')}>{me?.wishlisted ? '♥ Wishlisted' : '♡ WISHLIST'}</button>
                </div>
              </div>
              {liveCamp && <p className="text-[11px] leading-relaxed text-slate-500">Backing is crowdfunding with rewards — not an investment. Refund rules are shown before you pay.</p>}
              {g.protectedBy && <div className="rounded-lg bg-sky-400/10 p-2.5 text-xs text-sky-200">🛡️ Pledges and purchases for this project are recorded and covered by GameVest's refund & dispute process. <Link className="underline" to="/trust">Learn more</Link></div>}
            </div>

            <ScoreCard s={g.scoreDetail} />

            {liveCamp && <div className="card p-5"><h3 className="mb-3 font-display font-semibold text-white">Rewards</h3><ul className="space-y-3">{c.rewards.map((r) => <li key={r.id} className="rounded-xl border border-ink-600 bg-ink-900 p-3"><div className="flex justify-between"><b className="font-display text-sm text-white">{r.title}</b><span className="text-sm font-semibold text-brand-soft">{money(r.priceCents)}</span></div><p className="text-xs text-slate-400">{r.description}</p></li>)}</ul>
              {c.backers.length > 0 && <div className="mt-4 text-xs text-slate-500"><div className="mb-1 font-semibold text-slate-400">Recent backers</div>{c.backers.slice(0, 6).map((b) => b.name).join(', ')}…</div>}</div>}

            <div className="card p-5"><div className="flex items-center justify-between"><div><Link to={`/studios/${g.studio.slug}`} className="font-display font-semibold text-white hover:underline">{g.studio.name}</Link><div>{g.studio.verified ? <VerifiedBadge small /> : <span className="text-xs text-slate-500">Not verified</span>}</div></div>
              {g.studio.reputation && <div className="text-right"><div className="text-xs text-slate-500">Reputation</div><div className="font-display text-xl font-bold text-white">{g.studio.reputation.score}<span className="text-xs text-slate-500">/100</span></div></div>}</div>
              {g.studio.reputation && <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px] text-slate-400"><div><b className="block text-sm text-white">{g.studio.reputation.gamesReleased}</b>released</div><div><b className="block text-sm text-white">{g.studio.reputation.campaignsCompleted}</b>campaigns done</div><div><b className="block text-sm text-white">{g.studio.reputation.positivePct}%</b>positive</div></div>}</div>
            <button className="w-full text-center text-xs text-slate-500 underline hover:text-slate-300" onClick={needAuth(() => setModal({ t: 'report' }))}>Report project</button>
          </aside>
        </div>
      </div>

      {modal?.t === 'demo' && <DemoModal game={g} demo={demo} onClose={() => { setModal(null); loadSocial(); load(); }} />}
      {modal?.t === 'back' && <CheckoutModal mode="back" game={g} campaign={c} onClose={() => setModal(null)} onDone={load} />}
      {modal?.t === 'buy' && <CheckoutModal mode="buy" game={g} onClose={() => setModal(null)} onDone={load} />}
      {modal?.t === 'dlc' && <CheckoutModal mode="buy" game={g} dlc={modal.dlc} onClose={() => setModal(null)} onDone={load} />}
      {modal?.t === 'report' && <ReportModal game={g} onClose={() => setModal(null)} />}
    </div>
  );
}

function Reviews({ slug, reviews, mine, canWrite, onChange }) {
  const [f, setF] = useState({ rating: mine?.rating ?? 0, recommended: mine?.recommended ?? true, body: mine?.body ?? '' }); const [err, setErr] = useState(''); const [open, setOpen] = useState(false);
  const submit = async (e) => { e.preventDefault(); setErr(''); try { await api.post(`/games/${slug}/reviews`, f); setOpen(false); onChange(); } catch (x) { setErr(errMsg(x)); } };
  return (
    <div className="space-y-4">
      {canWrite && !open && <button className="btn-ghost" onClick={() => setOpen(true)}>{mine ? 'Edit your review' : 'Write a review'}</button>}
      {open && <form onSubmit={submit} className="card space-y-3 p-4">{err && <Alert tone="error">{err}</Alert>}
        <div className="flex gap-1" role="radiogroup" aria-label="Rating">{[1, 2, 3, 4, 5].map((n) => <button type="button" key={n} role="radio" aria-checked={f.rating === n} aria-label={`${n} stars`} onClick={() => setF({ ...f, rating: n })} className={`text-2xl ${n <= f.rating ? 'text-amber' : 'text-ink-500'}`}>★</button>)}</div>
        <div className="flex gap-2">{[[true, '👍 Recommend'], [false, '👎 Not recommended']].map(([v, l]) => <button type="button" key={l} onClick={() => setF({ ...f, recommended: v })} aria-pressed={f.recommended === v} className={`chip ${f.recommended === v ? 'chip-on' : ''}`}>{l}</button>)}</div>
        <textarea className="input" rows={4} minLength={10} maxLength={2000} required placeholder="Share your experience (min. 10 characters)" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
        <div className="flex gap-2"><button className="btn-primary" disabled={!f.rating}>Publish</button><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button></div></form>}
      {!canWrite && <p className="text-sm text-slate-500"><Link className="text-brand-soft underline" to="/login">Sign in</Link> to review.</p>}
      {reviews.length === 0 ? <p className="text-sm text-slate-500">No reviews yet.</p> : reviews.map((r) => <article key={r.id} className="card p-4"><div className="flex items-center justify-between"><Stars value={r.rating} /><span className="text-xs text-slate-500">{ago(r.createdAt)}</span></div><p className="mt-2 text-sm text-slate-200">{r.body}</p><div className="mt-2 text-xs text-slate-500">{r.author} · {r.recommended ? '👍 Recommended' : '👎 Not recommended'}{r.verified && <span className="text-mint"> · ✓ played</span>}</div></article>)}
    </div>
  );
}

function Comments({ slug, comments, canWrite, onChange }) {
  const [body, setBody] = useState(''); const [err, setErr] = useState('');
  const submit = async (e) => { e.preventDefault(); setErr(''); try { await api.post(`/games/${slug}/comments`, { body }); setBody(''); onChange(); } catch (x) { setErr(errMsg(x)); } };
  return (
    <div className="space-y-4">
      {canWrite ? <form onSubmit={submit} className="space-y-2">{err && <Alert tone="error">{err}</Alert>}<textarea className="input" rows={3} maxLength={1000} required placeholder="Ask the developer or share feedback…" value={body} onChange={(e) => setBody(e.target.value)} /><button className="btn-primary">Comment</button></form> : <p className="text-sm text-slate-500"><Link className="text-brand-soft underline" to="/login">Sign in</Link> to comment.</p>}
      {comments.map((c) => <div key={c.id} className="card p-4"><div className="flex items-center gap-2 text-xs"><b className="text-slate-200">{c.author}</b>{c.isDeveloper && <span className="rounded bg-brand/20 px-1.5 py-0.5 font-semibold text-brand-soft">DEV</span>}<span className="text-slate-500">{ago(c.createdAt)}</span></div><p className="mt-1.5 whitespace-pre-line text-sm text-slate-300">{c.body}</p></div>)}
    </div>
  );
}
