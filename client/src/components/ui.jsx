import { Link } from 'react-router-dom';
import { useEffect } from 'react';
import { STAGE, money, compact } from '../api';

export function Logo({ className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2 font-display font-bold tracking-tight ${className}`}>
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
        <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#a99dff" /><stop offset="1" stopColor="#6ee7b7" /></linearGradient></defs>
        <rect width="32" height="32" rx="8" fill="#10131b" stroke="#2e3548" />
        <path d="M8 9l8 14 8-14h-5l-3 5.4L13 9z" fill="url(#lg)" />
      </svg>
      <span className="text-white">GAME<span className="bg-gradient-to-r from-brand-soft to-mint bg-clip-text text-transparent">VEST</span></span>
    </span>
  );
}

// Procedural cover (no external assets): deterministic gradient + geometric shapes from the game's seed.
export function GameCover({ game, className = '', title = true }) {
  if (game.coverUrl) return <img src={game.coverUrl} alt={`${game.title} cover`} loading="lazy" className={`object-cover ${className}`} />;
  const s = game.coverSeed || 1;
  const r = (n) => ((s * 9301 + n * 49297) % 233280) / 233280;
  const h1 = Math.floor(r(1) * 360), h2 = (h1 + 40 + Math.floor(r(2) * 80)) % 360;
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ background: `linear-gradient(135deg, hsl(${h1} 55% 16%), hsl(${h2} 60% 9%))` }} role="img" aria-label={`${game.title} cover`}>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <circle cx={20 + r(3) * 60} cy={15 + r(4) * 40} r={18 + r(5) * 22} fill={`hsl(${h1} 80% 60% / .22)`} />
        <circle cx={30 + r(6) * 60} cy={50 + r(7) * 40} r={12 + r(8) * 25} fill={`hsl(${h2} 80% 60% / .2)`} />
        <path d={`M0 ${70 + r(9) * 20} Q ${25 + r(10) * 20} ${50 + r(11) * 20} 50 ${70 + r(12) * 15} T 100 ${60 + r(13) * 25} V100 H0Z`} fill={`hsl(${h1} 50% 8% / .85)`} />
      </svg>
      {title && <div className="absolute inset-x-3 bottom-3 font-display text-lg font-bold leading-tight text-white/90 drop-shadow">{game.title}</div>}
    </div>
  );
}

export const scoreTone = (n) => (n >= 80 ? 'text-mint border-mint/40 bg-mint/10' : n >= 60 ? 'text-brand-soft border-brand/40 bg-brand/10' : n >= 40 ? 'text-amber border-amber/40 bg-amber/10' : 'text-slate-300 border-ink-500 bg-ink-700');
export const SCORE_LABEL = { HIGH_POTENTIAL: 'High potential', PROMISING: 'Promising', EMERGING: 'Emerging', EARLY: 'Early' };

export function ScoreBadge({ score, size = 'sm' }) {
  if (!score) return null;
  return (
    <span title="GameVest Score: an engagement indicator, not a guarantee of success" className={`inline-flex items-center gap-1 rounded-lg border font-display font-bold ${scoreTone(score.total)} ${size === 'lg' ? 'px-3 py-1.5 text-lg' : 'px-2 py-0.5 text-xs'}`}>
      <svg width={size === 'lg' ? 14 : 10} height={size === 'lg' ? 14 : 10} viewBox="0 0 10 10"><path d="M5 0l1.3 3.4L10 3.8 7.2 6.2 8 10 5 8 2 10l.8-3.8L0 3.8l3.7-.4z" fill="currentColor" /></svg>
      {score.total}
    </span>
  );
}

export const StageBadge = ({ stage }) => <span className="rounded-md bg-ink-950/70 backdrop-blur px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-200 border border-white/10">{STAGE[stage] ?? stage}</span>;
export const VerifiedBadge = ({ small }) => <span title="GameVest Verified: identity and studio checks were completed. It is not a guarantee of success." className={`inline-flex items-center gap-1 text-mint ${small ? 'text-xs' : 'text-sm'} font-semibold`}><svg width="14" height="14" viewBox="0 0 16 16" aria-hidden><circle cx="8" cy="8" r="8" fill="currentColor" opacity=".18" /><path d="M4.5 8.3l2.2 2.2 4.8-5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>{small ? 'Verified' : 'GameVest Verified'}</span>;
export const ProtectedBadge = ({ small }) => <span title="Purchases and pledges are recorded and eligible for GameVest's refund and dispute process. Not a guarantee of project success or financial return." className={`inline-flex items-center gap-1 text-sky-300 ${small ? 'text-xs' : 'text-sm'} font-semibold`}>🛡️ {small ? 'Protected' : 'Protected by GameVest'}</span>;

export function Bar({ pct, tone = 'brand', height = 'h-2', label }) {
  const c = { brand: 'from-brand to-brand-soft', mint: 'from-mint-deep to-mint', amber: 'from-amber to-amber' }[tone];
  return <div role="progressbar" aria-valuenow={Math.min(100, pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label} className={`w-full ${height} overflow-hidden rounded-full bg-ink-600`}><div className={`h-full rounded-full bg-gradient-to-r ${c} transition-all duration-700`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} /></div>;
}

export function Stars({ value, size = 14 }) {
  return <span className="inline-flex items-center gap-1 text-amber" aria-label={`${value ?? 'No'} out of 5`}><svg width={size} height={size} viewBox="0 0 10 10"><path d="M5 0l1.3 3.4L10 3.8 7.2 6.2 8 10 5 8 2 10l.8-3.8L0 3.8l3.7-.4z" fill="currentColor" /></svg><span className="text-xs font-semibold text-slate-200">{value ?? '—'}</span></span>;
}

export function GameCard({ game, rank, className = '' }) {
  const f = game.funding;
  return (
    <Link to={`/games/${game.slug}`} className={`group card block overflow-hidden transition hover:-translate-y-0.5 hover:border-brand/50 hover:shadow-glow ${className}`}>
      <div className="relative aspect-[16/10] overflow-hidden">
        <GameCover game={game} className="h-full w-full transition duration-500 group-hover:scale-105" title={!game.coverUrl} />
        <div className="absolute left-2 top-2 flex gap-1.5"><StageBadge stage={game.stage} />{game.sponsored && <span className="rounded-md bg-amber/90 px-2 py-0.5 text-[11px] font-bold text-ink-950">SPONSORED</span>}</div>
        <div className="absolute right-2 top-2"><ScoreBadge score={game.score} /></div>
        {rank && <div className="absolute bottom-2 left-2 rounded-md bg-ink-950/80 px-2 py-0.5 font-display text-sm font-bold text-white">#{rank}</div>}
        {game.hasDemo && <div className="absolute bottom-2 right-2 rounded-md bg-mint px-2 py-0.5 text-[11px] font-bold text-ink-950">▶ DEMO</div>}
      </div>
      <div className="space-y-2 p-3.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 font-display text-base font-semibold text-white">{game.title}</h3>
          <Stars value={game.rating} />
        </div>
        <p className="line-clamp-1 text-xs text-slate-400">{game.genres.join(' · ')} · <span className="text-slate-300">{game.studio.name}</span>{game.studio.verified && <span className="ml-1 text-mint">✓</span>}</p>
        {f ? (
          <div className="space-y-1">
            <Bar pct={f.pct} tone="mint" height="h-1.5" label="Funding" />
            <div className="flex justify-between text-[11px] text-slate-400"><span className="font-semibold text-slate-200">{money(f.raisedCents)}</span><span>{f.pct}% · {f.daysLeft}d left</span></div>
          </div>
        ) : (
          <div className="text-[11px] text-slate-500">{game.priceCents ? money(game.priceCents, { exact: true }) : game.stage === 'RELEASED' ? 'Free' : 'In development'}</div>
        )}
        <div className="flex gap-3 text-[11px] text-slate-500"><span>👥 {compact(game.followers)}</span><span>♥ {compact(game.wishlist)}</span></div>
      </div>
    </Link>
  );
}

export function Row({ title, subtitle, to, items, ranked, emptyHint }) {
  if (!items?.length) return emptyHint ? null : null;
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between px-4 md:px-0">
        <div><h2 className="section-title">{title}</h2>{subtitle && <p className="text-sm text-slate-400">{subtitle}</p>}</div>
        {to && <Link to={to} className="text-sm font-medium text-brand-soft hover:underline">See all →</Link>}
      </div>
      <div className="no-scrollbar -mx-0 flex snap-x gap-4 overflow-x-auto px-4 pb-2 md:px-0">
        {items.map((g, i) => <div key={g.id} className="w-[260px] shrink-0 snap-start md:w-[280px]"><GameCard game={g} rank={ranked ? i + 1 : undefined} /></div>)}
      </div>
    </section>
  );
}

export function Modal({ open, onClose, title, children, wide }) {
  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k); document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-label={title}>
      <div className={`rise max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-ink-500 bg-ink-800 p-5 sm:rounded-3xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}>
        <div className="mb-4 flex items-center justify-between"><h2 className="font-display text-xl font-semibold text-white">{title}</h2><button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-ink-600" aria-label="Close">✕</button></div>
        {children}
      </div>
    </div>
  );
}

export const Spinner = () => <div className="flex justify-center py-16" role="status" aria-label="Loading"><div className="h-7 w-7 animate-spin rounded-full border-2 border-ink-500 border-t-brand" /></div>;
export const Empty = ({ children }) => <div className="card px-6 py-10 text-center text-sm text-slate-400">{children}</div>;
export const Alert = ({ tone = 'info', children }) => {
  const c = { info: 'border-sky-400/30 bg-sky-400/10 text-sky-200', warn: 'border-amber/30 bg-amber/10 text-amber', error: 'border-danger/30 bg-danger/10 text-danger', ok: 'border-mint/30 bg-mint/10 text-mint' }[tone];
  return <div role={tone === 'error' ? 'alert' : undefined} className={`rounded-xl border px-3.5 py-2.5 text-sm ${c}`}>{children}</div>;
};
export const Field = ({ label, children, hint }) => <label className="block"><span className="label">{label}</span>{children}{hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}</label>;

export function Stat({ label, value, sub, tone }) {
  return <div className="card p-4"><div className="text-xs uppercase tracking-wide text-slate-500">{label}</div><div className={`mt-1 font-display text-2xl font-bold ${tone ?? 'text-white'}`}>{value}</div>{sub && <div className="text-xs text-slate-400">{sub}</div>}</div>;
}

// ---- tiny dependency-free charts ----
export function AreaChart({ data, x = 'date', y, color = '#8b7bff', height = 140, fmt = (v) => v }) {
  if (!data?.length) return <div className="text-sm text-slate-500">No data yet</div>;
  const vals = data.map((d) => d[y]); const max = Math.max(...vals, 1), min = 0;
  const W = 400, H = 100, step = W / Math.max(1, data.length - 1);
  const pts = vals.map((v, i) => [i * step, H - ((v - min) / (max - min || 1)) * (H - 8) - 4]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const id = `ag-${y}`;
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} preserveAspectRatio="none" role="img" aria-label={`${y} over time`}>
        <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".35" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
        {[0.25, 0.5, 0.75].map((t) => <line key={t} x1="0" x2={W} y1={H * t} y2={H * t} stroke="#222838" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
        <path d={`${line} L${W} ${H} L0 ${H}Z`} fill={`url(#${id})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <figcaption className="mt-1 flex justify-between text-[11px] text-slate-500"><span>{String(data[0][x]).slice(5)}</span><span>peak {fmt(max)}</span><span>{String(data[data.length - 1][x]).slice(5)}</span></figcaption>
    </figure>
  );
}

export function BarChart({ data, label, value, color = '#8b7bff', fmt = (v) => v }) {
  const max = Math.max(...data.map((d) => d[value]), 1);
  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d[label]} className="flex items-center gap-3 text-xs"><span className="w-10 shrink-0 text-slate-400">{d[label]}</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink-600"><div className="h-full rounded-full" style={{ width: `${(100 * d[value]) / max}%`, background: color }} /></div>
          <span className="w-12 text-right text-slate-300">{fmt(d[value])}</span></div>
      ))}
    </div>
  );
}

export function useTitle(t) { useEffect(() => { document.title = t ? `${t} · GameVest` : 'GameVest — Discover. Play. Back the next big game.'; }, [t]); }
