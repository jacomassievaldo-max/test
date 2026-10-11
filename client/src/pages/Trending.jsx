import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { money, compact } from '../api';
import { GameCover, ScoreBadge, Spinner, Empty, useTitle } from '../components/ui';

const Change = ({ c, isNew }) => isNew ? <span className="text-xs font-bold text-sky-300">NEW</span> : c > 0 ? <span className="text-xs font-bold text-mint">↑{c}</span> : c < 0 ? <span className="text-xs font-bold text-danger">↓{-c}</span> : <span className="text-xs text-slate-500">—</span>;

export default function Trending() {
  useTitle('Trending');
  const [d, setD] = useState(null);
  useEffect(() => { api.get('/trending').then((r) => setD(r.data)); }, []);
  return (
    <div className="px-4 py-8 md:py-10">
      <h1 className="font-display text-3xl font-bold text-white md:text-4xl">GameVest Trending</h1>
      <p className="mt-1 max-w-2xl text-slate-400">Weekly ranking of the games gaining real traction. Counts unique, authentic accounts only; new-account bursts and suspicious activity are down-weighted.</p>
      <div className="mt-8 space-y-3">
        {!d ? <Spinner /> : d.items.length === 0 ? <Empty>No ranking yet this week.</Empty> : d.items.map((it) => (
          <Link key={it.game.id} to={`/games/${it.game.slug}`} className="card group flex items-center gap-3 p-3 transition hover:border-brand/50 md:gap-5 md:p-4">
            <div className="w-10 text-center font-display text-2xl font-bold text-white md:w-14 md:text-3xl">#{it.rank}<div className="-mt-1"><Change c={it.change} isNew={it.isNew} /></div></div>
            <GameCover game={it.game} title={false} className="hidden h-16 w-28 shrink-0 rounded-lg sm:block" />
            <div className="min-w-0 flex-1"><div className="truncate font-display text-lg font-semibold text-white">{it.game.title}</div><div className="truncate text-xs text-slate-400">{it.game.genres.join(' · ')} · {it.game.studio.name}</div>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400"><span>🎮 {it.players} players</span><span>👥 +{it.weekFollows} follows</span><span>♥ +{it.weekWishlist} wishlist</span>{it.game.funding && <span>💰 {money(it.game.funding.raisedCents)} · {it.game.funding.pct}%</span>}</div></div>
            <div className="text-right"><ScoreBadge score={it.game.score} size="lg" /><div className="mt-1 text-[11px] text-slate-500">{compact(it.game.followers)} followers</div></div>
          </Link>
        ))}
      </div>
      <p className="mt-6 text-xs text-slate-500">Week starting {d?.weekStart ? new Date(d.weekStart).toLocaleDateString() : '—'}. Rankings are informational and do not predict commercial success.</p>
    </div>
  );
}
