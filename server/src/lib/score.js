// GameVest Score V1. A transparent heuristic over real, de-duplicated signals.
// It is an engagement indicator, NEVER a prediction of commercial success or financial return.
import { prisma } from '../db.js';

const clamp = (n, a = 0, b = 100) => Math.max(a, Math.min(b, Math.round(n)));
const sat = (x, k) => 1 - Math.exp(-x / k); // saturating curve 0..1, diminishes gaming by volume

export function labelFor(total) {
  if (total >= 80) return 'HIGH_POTENTIAL';
  if (total >= 60) return 'PROMISING';
  if (total >= 40) return 'EMERGING';
  return 'EARLY';
}

export async function computeScore(gameId) {
  const since = new Date(Date.now() - 14 * 864e5);
  const prev = new Date(Date.now() - 28 * 864e5);
  const [game, fb, sessions, reviews, wish, follow, wishNew, wishPrev, camp, updates, an] = await Promise.all([
    prisma.game.findUnique({ where: { id: gameId } }),
    prisma.demoFeedback.aggregate({ where: { gameId }, _avg: { rating: true }, _count: true }),
    prisma.demoSession.aggregate({ where: { gameId }, _avg: { durationSec: true }, _count: true }),
    prisma.review.aggregate({ where: { gameId, hidden: false, user: { flagged: false } }, _avg: { rating: true }, _count: true }),
    prisma.wishlist.count({ where: { gameId, user: { flagged: false } } }),
    prisma.follow.count({ where: { gameId, user: { flagged: false } } }),
    prisma.wishlist.count({ where: { gameId, createdAt: { gte: since }, user: { flagged: false } } }),
    prisma.wishlist.count({ where: { gameId, createdAt: { gte: prev, lt: since }, user: { flagged: false } } }),
    prisma.campaign.findFirst({ where: { gameId, status: { in: ['ACTIVE', 'FUNDED', 'ENDED'] } }, orderBy: { createdAt: 'desc' } }),
    prisma.gameUpdate.count({ where: { gameId, createdAt: { gte: new Date(Date.now() - 45 * 864e5) } } }),
    prisma.gameAnalytics.findMany({ where: { gameId, date: { gte: prev } } }),
  ]);
  if (!game) return null;

  const completed = await prisma.demoSession.count({ where: { gameId, completed: true } });
  const completion = sessions._count ? completed / sessions._count : 0;
  const returning = an.reduce((s, a) => s + a.returningPlayers, 0);
  const players = an.reduce((s, a) => s + a.players, 0) + sessions._count;
  const retention = players ? Math.min(1, returning / players) : 0;
  const demoRating = fb._avg.rating ? (fb._avg.rating - 1) / 4 : null;

  // Gameplay: demo rating, completion, retention, time played (no demo => neutral-low)
  const playMin = (sessions._avg.durationSec || 0) / 60;
  const gameplay = demoRating === null && !sessions._count
    ? 30
    : clamp(100 * (0.45 * (demoRating ?? 0.5) + 0.25 * completion + 0.15 * retention + 0.15 * sat(playMin, 12)));

  // Community: reviews + followers + wishlist (log-saturated so mass accounts can't dominate)
  const revScore = reviews._avg.rating ? (reviews._avg.rating - 1) / 4 : 0.4;
  const community = clamp(100 * (0.4 * revScore + 0.3 * sat(follow, 400) + 0.3 * sat(wish, 800)));

  // Growth: week-over-week wishlist growth + recent player volume
  const growthRatio = wishPrev ? (wishNew - wishPrev) / wishPrev : wishNew > 0 ? 0.5 : 0;
  const growth = clamp(100 * (0.55 * sat(Math.max(0, growthRatio + 0.3), 0.8) + 0.45 * sat(players, 3000)));

  // Funding: % of goal (capped), only if a campaign exists
  const funding = camp ? clamp(100 * Math.min(1, camp.raisedCents / camp.goalCents) * 0.85 + 15 * sat(camp.backersCount, 300)) : 0;

  // Development: progress + update cadence + stage
  const stageBonus = { CONCEPT: 0, PROTOTYPE: 0.2, ALPHA: 0.45, BETA: 0.7, EARLY_ACCESS: 0.85, RELEASED: 1 }[game.stage];
  const development = clamp(100 * (0.4 * game.progress / 100 + 0.35 * sat(updates, 3) + 0.25 * stageBonus));

  const hasCamp = !!camp;
  const w = hasCamp
    ? { gameplay: 0.3, community: 0.2, growth: 0.15, funding: 0.15, development: 0.2 }
    : { gameplay: 0.35, community: 0.25, growth: 0.2, funding: 0, development: 0.2 };
  const total = clamp(gameplay * w.gameplay + community * w.community + growth * w.growth + funding * w.funding + development * w.development);
  const data = { total, gameplay, community, growth, funding, development, label: labelFor(total), computedAt: new Date() };
  return prisma.gameVestScore.upsert({ where: { gameId }, create: { gameId, ...data }, update: data });
}

export async function recomputeAllScores() {
  const games = await prisma.game.findMany({ where: { status: 'PUBLISHED' }, select: { id: true } });
  for (const g of games) await computeScore(g.id);
}
