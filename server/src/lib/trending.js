// Weekly trending with anti-manipulation:
//  - counts UNIQUE users only (db constraints already guarantee one wishlist/follow per user per game)
//  - ignores flagged/suspended users
//  - accounts younger than 24h count at 25% weight (burst-of-new-accounts protection)
//  - log-saturation per signal so volume alone cannot dominate
//  - games with an anomalous spike of new-account signals are flagged and damped
import { prisma } from '../db.js';
import { secLog } from './security.js';

const DAY = 864e5;
const monday = (d = new Date()) => {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x;
};

export async function computeTrending() {
  const since = new Date(Date.now() - 7 * DAY);
  const fresh = new Date(Date.now() - DAY);
  const games = await prisma.game.findMany({
    where: { status: 'PUBLISHED' },
    include: { score: true, campaigns: { where: { status: 'ACTIVE' }, take: 1 } },
  });
  const weight = (u) => (u.flagged || u.status !== 'ACTIVE' ? 0 : u.createdAt > fresh ? 0.25 : 1);
  const rows = [];
  for (const g of games) {
    const [wl, fo, rv, ss, bk] = await Promise.all([
      prisma.wishlist.findMany({ where: { gameId: g.id, createdAt: { gte: since } }, select: { user: true } }),
      prisma.follow.findMany({ where: { gameId: g.id, createdAt: { gte: since } }, select: { user: true } }),
      prisma.review.findMany({ where: { gameId: g.id, createdAt: { gte: since }, hidden: false }, select: { user: true } }),
      prisma.demoSession.findMany({ where: { gameId: g.id, startedAt: { gte: since } }, select: { userId: true, durationSec: true } }),
      prisma.backing.findMany({ where: { campaign: { gameId: g.id }, createdAt: { gte: since }, transaction: { status: 'PAID' } }, select: { user: true, amountCents: true } }),
    ]);
    const sum = (a) => a.reduce((s, x) => s + weight(x.user), 0);
    const newAcct = [...wl, ...fo, ...rv, ...bk].filter((x) => x.user.createdAt > fresh).length;
    const total = wl.length + fo.length + rv.length + bk.length;
    const suspicious = total >= 10 && newAcct / total > 0.7;
    if (suspicious) await secLog('ranking_anomaly', { detail: `game ${g.slug}: ${newAcct}/${total} signals from <24h accounts`, severity: 'warn' });
    const uniquePlayers = new Set(ss.filter((s) => s.userId).map((s) => s.userId)).size + ss.filter((s) => !s.userId && s.durationSec >= 30).length;
    const raw = 3 * Math.log1p(sum(wl)) + 2 * Math.log1p(sum(fo)) + 2 * Math.log1p(sum(rv)) +
      3 * Math.log1p(uniquePlayers) + 3 * Math.log1p(sum(bk)) + 0.06 * (g.score?.total ?? 0);
    rows.push({ game: g, points: +(raw * (suspicious ? 0.4 : 1)).toFixed(3), suspicious });
  }
  rows.sort((a, b) => b.points - a.points);
  const ws = monday();
  const lastWeek = await prisma.trendingSnapshot.findMany({ where: { weekStart: new Date(ws.getTime() - 7 * DAY) } });
  const prevRank = new Map(lastWeek.map((s) => [s.gameId, s.rank]));
  for (const [i, r] of rows.entries()) {
    await prisma.trendingSnapshot.upsert({
      where: { gameId_weekStart: { gameId: r.game.id, weekStart: ws } },
      create: { gameId: r.game.id, weekStart: ws, rank: i + 1, points: r.points },
      update: { rank: i + 1, points: r.points },
    });
  }
  return rows.map((r, i) => ({ gameId: r.game.id, rank: i + 1, change: prevRank.has(r.game.id) ? prevRank.get(r.game.id) - (i + 1) : null, points: r.points }));
}
