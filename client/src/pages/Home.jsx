import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { money, STAGE } from '../api';
import { GameCover, Row, ScoreBadge, Spinner, Bar, useTitle, VerifiedBadge } from '../components/ui';

const LOOP = [['Developer', 'creates a project'], ['GameVest', 'publishes & distributes'], ['Players', 'discover & test'], ['Community', 'rates & follows'], ['Data', 'measures real interest'], ['Funding', 'helps it grow'], ['Release', 'the game launches'], ['Store', 'keeps selling'], ['Publishers', 'find new talent']];

export default function Home() {
  useTitle();
  const [d, setD] = useState(null);
  useEffect(() => { api.get('/home').then((r) => setD(r.data)); }, []);
  const f = d?.featured;
  return (
    <div className="space-y-14 pb-6">
      <section className="relative overflow-hidden md:mt-6 md:rounded-3xl">
        <div className="absolute inset-0">{f && <GameCover game={f} title={false} className="h-full w-full scale-110 opacity-60 blur-sm" />}<div className="absolute inset-0 bg-gradient-to-r from-ink-950 via-ink-950/85 to-ink-950/30" /><div className="absolute inset-0 bg-gradient-to-t from-ink-950 to-transparent" /></div>
        <div className="relative grid gap-8 px-5 py-14 md:grid-cols-5 md:px-12 md:py-24">
          <div className="space-y-6 md:col-span-3">
            <span className="chip chip-on">Discover. Play. Back the next big game.</span>
            <h1 className="font-display text-4xl font-bold leading-[1.05] text-white md:text-6xl">Find the next big game <span className="bg-gradient-to-r from-brand-soft via-white to-mint bg-clip-text text-transparent">before everyone else.</span></h1>
            <p className="max-w-xl text-base text-slate-300 md:text-lg">Discover upcoming games, play early demos and support the developers building them.</p>
            <div className="flex flex-wrap gap-3"><Link to="/discover" className="btn-primary !px-6 !py-3">EXPLORE GAMES</Link><Link to="/register?role=DEVELOPER" className="btn-ghost !px-6 !py-3">SUBMIT YOUR GAME</Link></div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 pt-2 text-xs text-slate-400"><span>🛡️ Purchases recorded & refund-ready</span><span><span className="text-mint">✓</span> Verified developers</span><span>▶ Play before you back</span></div>
          </div>
          {f && (
            <Link to={`/games/${f.slug}`} className="card group hidden self-end overflow-hidden backdrop-blur md:col-span-2 md:block hover:border-brand/50">
              <GameCover game={f} className="aspect-[16/9] w-full" />
              <div className="space-y-2 p-4"><div className="flex items-center justify-between"><span className="text-xs uppercase tracking-wide text-slate-500">Featured · {STAGE[f.stage]}</span><ScoreBadge score={f.score} /></div>
                <div className="font-display text-lg font-semibold text-white">{f.title}</div>
                {f.funding && <><Bar pct={f.funding.pct} tone="mint" /><div className="flex justify-between text-xs text-slate-400"><span>{money(f.funding.raisedCents)} of {money(f.funding.goalCents)}</span><span>{f.funding.backers.toLocaleString('pt-BR')} backers</span></div></>}
                <div className="text-xs">{f.studio.verified && <VerifiedBadge small />} <span className="text-slate-400">{f.studio.name}</span></div></div>
            </Link>
          )}
        </div>
      </section>

      {!d ? <Spinner /> : (
        <div className="space-y-12">
          {d.sponsored.length > 0 && <Row title="Sponsored projects" subtitle="Clearly marked placements — never mixed into rankings" items={d.sponsored} />}
          <Row title="🔥 Trending" subtitle="This week's ranking, protected against artificial boosting" to="/trending" items={d.trending} ranked />
          <Row title="🚀 Rising Projects" to="/discover?sort=growth" items={d.rising} />
          <Row title="🎮 Playable Demos" subtitle="Play in your browser, then tell the developer what you think" to="/demos" items={d.demos} />
          <Row title="💎 Hidden Gems" subtitle="High score, small audience — discover them early" to="/discover?sort=score" items={d.hiddenGems} />
          <Row title="💰 Most Funded" to="/funding" items={d.mostFunded} />
          <Row title="⭐ Top Rated" to="/discover?sort=rating" items={d.topRated} />
          <Row title="🆕 Recently Added" to="/discover?sort=new" items={d.recent} />
          <Row title="🏆 Highest GameVest Score" to="/discover?sort=score" items={d.highestScore} ranked />
          <Row title="📈 Fastest Growing" to="/discover?sort=growth" items={d.fastestGrowing} />
        </div>
      )}

      <section className="px-4 md:px-0">
        <div className="card overflow-hidden p-6 md:p-10">
          <h2 className="section-title">The GameVest cycle</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">GameVest follows a game through its whole life — from the first prototype to the store shelf.</p>
          <ol className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            {LOOP.map(([a, b], i) => <li key={a} className="rounded-xl border border-ink-600 bg-ink-900 p-3"><div className="font-display text-xs text-brand-soft">0{i + 1}</div><div className="font-semibold text-white">{a}</div><div className="text-xs text-slate-400">{b}</div></li>)}
          </ol>
        </div>
      </section>
    </div>
  );
}
