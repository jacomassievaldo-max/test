import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api';
import { GameCard, Spinner, Empty, useTitle } from '../components/ui';

const PRESETS = {
  discover: { title: 'Discover', sub: 'Explore every game on GameVest', fixed: {} },
  store: { title: 'Store', sub: 'Finished and Early Access games you can buy today', fixed: { status: 'released' } },
  demos: { title: 'Playable Demos', sub: 'PLAY NOW — try games before they launch', fixed: { demo: 'true' } },
  funding: { title: 'Funding', sub: 'Campaigns you can support. Crowdfunding with rewards — not an investment.', fixed: { funding: 'true' }, sort: 'funded' },
};
const STAGES = ['CONCEPT', 'PROTOTYPE', 'ALPHA', 'BETA', 'EARLY_ACCESS', 'RELEASED'];
const SORTS = [['score', 'GameVest Score'], ['trending', 'Trending'], ['rating', 'Rating'], ['new', 'Newest'], ['funded', 'Most funded'], ['growth', 'Fastest growing'], ['release', 'Release date'], ['priceAsc', 'Price ↑'], ['priceDesc', 'Price ↓']];

function Multi({ label, options, value, onChange }) {
  const set = new Set(value ? value.split(',') : []);
  const toggle = (o) => { set.has(o) ? set.delete(o) : set.add(o); onChange([...set].join(',')); };
  return <div><div className="label">{label}</div><div className="flex flex-wrap gap-1.5">{options.map((o) => <button key={o} type="button" onClick={() => toggle(o)} aria-pressed={set.has(o)} className={`chip transition ${set.has(o) ? 'chip-on' : 'hover:border-slate-400'}`}>{o.replaceAll('_', ' ')}</button>)}</div></div>;
}

export default function Explore({ mode }) {
  const preset = PRESETS[mode]; useTitle(preset.title);
  const [sp, setSp] = useSearchParams();
  const [meta, setMeta] = useState({ genres: [], platforms: [] });
  const [res, setRes] = useState(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { api.get('/meta').then((r) => setMeta(r.data)); }, []);
  const params = useMemo(() => Object.fromEntries(sp.entries()), [sp]);
  const query = useMemo(() => ({ ...(preset.sort ? { sort: preset.sort } : {}), ...params, ...preset.fixed }), [params, preset]);
  useEffect(() => { setRes(null); api.get('/games', { params: query }).then((r) => setRes(r.data)); }, [query]);
  const set = (k, v) => { const n = new URLSearchParams(sp); v === '' || v == null || v === false ? n.delete(k) : n.set(k, v); setSp(n, { replace: true }); };
  const active = ['genre', 'platform', 'stage', 'minScore', 'minRating', 'priceMax', 'demo', 'funding', 'status', 'q'].filter((k) => params[k] && !(k in preset.fixed)).length;

  const Filters = (
    <div className="space-y-5">
      <Multi label="Genre" options={meta.genres} value={params.genre} onChange={(v) => set('genre', v)} />
      <Multi label="Platform" options={meta.platforms} value={params.platform} onChange={(v) => set('platform', v)} />
      <Multi label="Development stage" options={STAGES} value={params.stage} onChange={(v) => set('stage', v)} />
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label" htmlFor="ms">Min. GameVest Score</label><input id="ms" type="number" min="0" max="100" className="input" value={params.minScore ?? ''} onChange={(e) => set('minScore', e.target.value)} placeholder="0–100" /></div>
        <div><label className="label" htmlFor="mr">Min. rating</label><input id="mr" type="number" min="1" max="5" step="0.5" className="input" value={params.minRating ?? ''} onChange={(e) => set('minRating', e.target.value)} placeholder="1–5" /></div>
        <div><label className="label" htmlFor="pm">Max. price (R$)</label><input id="pm" type="number" min="0" className="input" value={params.priceMax ?? ''} onChange={(e) => set('priceMax', e.target.value)} placeholder="any" /></div>
        <div><label className="label" htmlFor="rb">Release before</label><input id="rb" type="date" className="input" value={params.releaseBefore ?? ''} onChange={(e) => set('releaseBefore', e.target.value)} /></div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {[['demo', 'Playable demo'], ['funding', 'Open funding'], ['free', 'Free']].map(([k, l]) => !(k in preset.fixed) && <button key={k} onClick={() => set(k, params[k] === 'true' ? '' : 'true')} aria-pressed={params[k] === 'true'} className={`chip ${params[k] === 'true' ? 'chip-on' : ''}`}>{l}</button>)}
        {mode !== 'store' && [['released', 'Released'], ['upcoming', 'Upcoming']].map(([k, l]) => <button key={k} onClick={() => set('status', params.status === k ? '' : k)} aria-pressed={params.status === k} className={`chip ${params.status === k ? 'chip-on' : ''}`}>{l}</button>)}
      </div>
      {active > 0 && <button className="text-sm text-brand-soft hover:underline" onClick={() => setSp({}, { replace: true })}>Clear all filters</button>}
    </div>
  );

  return (
    <div className="px-4 py-8 md:py-10">
      <div className="mb-6"><h1 className="font-display text-3xl font-bold text-white md:text-4xl">{preset.title}</h1><p className="mt-1 text-slate-400">{preset.sub}</p></div>
      <div className="mb-6 no-scrollbar flex gap-2 overflow-x-auto">
        {meta.genres.map((g) => <button key={g} onClick={() => set('genre', params.genre === g ? '' : g)} className={`chip shrink-0 ${params.genre === g ? 'chip-on' : 'hover:border-slate-400'}`}>{g}</button>)}
      </div>
      <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
        <aside className="hidden lg:block"><div className="card sticky top-24 p-5">{Filters}</div></aside>
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <input className="input max-w-xs" placeholder="Search…" aria-label="Search games" value={params.q ?? ''} onChange={(e) => set('q', e.target.value)} />
            <button className="btn-ghost lg:hidden" onClick={() => setOpen(!open)}>Filters{active ? ` (${active})` : ''}</button>
            <select className="input ml-auto !w-auto" aria-label="Sort" value={params.sort ?? preset.sort ?? 'score'} onChange={(e) => set('sort', e.target.value)}>{SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </div>
          {open && <div className="card mb-4 p-4 lg:hidden">{Filters}</div>}
          {!res ? <Spinner /> : res.games.length === 0 ? <Empty>No games match these filters yet.</Empty> : (
            <>
              <p className="mb-3 text-sm text-slate-500">{res.total} game{res.total === 1 ? '' : 's'}</p>
              <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 xl:grid-cols-3">{res.games.map((g) => <GameCard key={g.id} game={g} />)}</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
