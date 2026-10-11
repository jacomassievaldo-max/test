// Developer Reputation is derived ONLY from verifiable history. It cannot be bought or edited.
import { prisma } from '../db.js';

export async function computeReputation(studioId) {
  const [studio, games, campaigns, reviews, reports, refunds] = await Promise.all([
    prisma.studio.findUnique({ where: { id: studioId }, include: { verification: true } }),
    prisma.game.findMany({ where: { studioId, status: 'PUBLISHED' }, select: { id: true, stage: true, lastUpdateAt: true } }),
    prisma.campaign.findMany({ where: { game: { studioId } } }),
    prisma.review.findMany({ where: { game: { studioId }, hidden: false, user: { flagged: false } }, select: { recommended: true } }),
    prisma.report.count({ where: { studioId, status: 'ACTIONED' } }),
    prisma.refund.count({ where: { OR: [{ purchase: { game: { studioId } } }, { backing: { campaign: { game: { studioId } } } }], status: { in: ['APPROVED', 'AUTO_APPROVED', 'PAID'] } } }),
  ]);
  if (!studio) return null;
  const gamesReleased = games.filter((g) => g.stage === 'RELEASED').length;
  const campaignsCompleted = campaigns.filter((c) => c.status === 'ENDED' && c.raisedCents >= c.goalCents).length;
  const positivePct = reviews.length ? Math.round((100 * reviews.filter((r) => r.recommended).length) / reviews.length) : 0;
  const ageMonths = (Date.now() - studio.createdAt.getTime()) / (30 * 864e5);
  const active = games.filter((g) => Date.now() - g.lastUpdateAt.getTime() < 60 * 864e5).length;

  let score = 40;
  score += studio.verification?.status === 'APPROVED' ? 15 : 0;
  score += Math.min(15, gamesReleased * 5);
  score += Math.min(10, campaignsCompleted * 5);
  score += reviews.length >= 3 ? Math.round(positivePct * 0.15) : 0;
  score += Math.min(5, Math.floor(ageMonths / 3));
  score += Math.min(5, active * 2.5);
  score -= reports * 10 + Math.min(10, refunds * 2);
  score = Math.max(0, Math.min(100, Math.round(score)));
  const data = { score, gamesReleased, campaignsCompleted, positivePct, computedAt: new Date() };
  return prisma.developerReputation.upsert({ where: { studioId }, create: { studioId, ...data }, update: data });
}
