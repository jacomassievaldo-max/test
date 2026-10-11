import { prisma } from '../db.js';

export const cardInclude = {
  studio: { select: { id: true, name: true, slug: true, country: true, verification: { select: { status: true } } } },
  score: true,
  demos: { where: { active: true }, select: { id: true, kind: true } },
  campaigns: { where: { status: { in: ['ACTIVE', 'FUNDED', 'ENDED'] }, adminApproved: true }, orderBy: { createdAt: 'desc' }, take: 1 },
  _count: { select: { follows: true, wishlist: true, reviews: true } },
};

export function toCard(g, extra = {}) {
  const c = g.campaigns?.[0];
  return {
    id: g.id, slug: g.slug, title: g.title, tagline: g.tagline, genres: g.genres, platforms: g.platforms,
    stage: g.stage, progress: g.progress, priceCents: g.priceCents, coverUrl: g.coverUrl, coverSeed: g.coverSeed,
    releaseDate: g.releaseDate, estimatedRelease: g.estimatedRelease, createdAt: g.createdAt,
    studio: { name: g.studio.name, slug: g.studio.slug, verified: g.studio.verification?.status === 'APPROVED' },
    score: g.score ? { total: g.score.total, label: g.score.label, growth: g.score.growth } : null,
    rating: extra.rating ?? null, ratingCount: g._count?.reviews ?? 0,
    followers: g._count?.follows ?? 0, wishlist: g._count?.wishlist ?? 0,
    hasDemo: (g.demos?.length ?? 0) > 0,
    protectedBy: g.protectedBy, sponsored: g.sponsored, featured: g.featured,
    funding: c ? {
      campaignId: c.id, goalCents: c.goalCents, raisedCents: c.raisedCents, backers: c.backersCount,
      pct: Math.round((100 * c.raisedCents) / c.goalCents), endsAt: c.endsAt, status: c.status,
      daysLeft: Math.max(0, Math.ceil((c.endsAt - Date.now()) / 864e5)),
    } : null,
    ...extra.rest,
  };
}

export async function loadCards(where = {}, { take } = {}) {
  const games = await prisma.game.findMany({ where: { status: 'PUBLISHED', ...where }, include: cardInclude, take });
  if (!games.length) return [];
  const ratings = await prisma.review.groupBy({
    by: ['gameId'], where: { gameId: { in: games.map((g) => g.id) }, hidden: false }, _avg: { rating: true },
  });
  const rmap = new Map(ratings.map((r) => [r.gameId, r._avg.rating]));
  return games.map((g) => toCard(g, { rating: rmap.get(g.id) ? +rmap.get(g.id).toFixed(1) : null }));
}
