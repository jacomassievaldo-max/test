import { Router } from 'express';
import { prisma } from '../db.js';
import { wrap } from '../middleware/auth.js';
import { loadCards, cardInclude, toCard } from '../lib/cards.js';
import { httpError, GENRES, PLATFORMS } from '../lib/util.js';
import { bump } from '../lib/analytics.js';
import { getPolicies } from '../lib/policies.js';
import { config } from '../config.js';
import { computeReputation } from '../lib/reputation.js';

const r = Router();
const by = (fn, dir = -1) => (a, b) => dir * ((fn(a) ?? -1) - (fn(b) ?? -1));
const take = (a, n = 10) => a.slice(0, n);

r.get('/meta', (_req, res) => res.json({ genres: GENRES, platforms: PLATFORMS, termsVersion: config.termsVersion, stages: ['CONCEPT', 'PROTOTYPE', 'ALPHA', 'BETA', 'EARLY_ACCESS', 'RELEASED'] }));
r.get('/policies/refund', wrap(async (_req, res) => res.json({ policies: await getPolicies(), termsVersion: config.termsVersion })));

r.get('/home', wrap(async (_req, res) => {
  const cards = await loadCards();
  const snaps = await prisma.trendingSnapshot.findMany({ orderBy: { weekStart: 'desc' }, take: 200 });
  const latest = snaps.length ? snaps[0].weekStart.getTime() : 0;
  const rank = new Map(snaps.filter((s) => s.weekStart.getTime() === latest).map((s) => [s.gameId, s.rank]));
  const trending = cards.filter((c) => rank.has(c.id)).sort((a, b) => rank.get(a.id) - rank.get(b.id)).map((c) => ({ ...c, trendRank: rank.get(c.id) }));
  const sc = (c) => c.score?.total ?? 0;
  const median = [...cards].map((c) => c.followers).sort((a, b) => a - b)[Math.floor(cards.length / 2)] ?? 0;
  res.json({
    featured: cards.find((c) => c.featured) ?? cards.sort(by(sc))[0] ?? null,
    trending: take(trending),
    rising: take(cards.filter((c) => c.stage !== 'RELEASED' && sc(c) >= 50).sort(by((c) => c.score?.growth))),
    demos: take(cards.filter((c) => c.hasDemo).sort(by(sc))),
    hiddenGems: take(cards.filter((c) => sc(c) >= 55 && c.followers <= median).sort(by(sc))),
    mostFunded: take(cards.filter((c) => c.funding).sort(by((c) => c.funding.raisedCents))),
    topRated: take(cards.filter((c) => c.ratingCount >= 1).sort(by((c) => c.rating))),
    recent: take([...cards].sort(by((c) => +new Date(c.createdAt)))),
    highestScore: take([...cards].sort(by(sc))),
    fastestGrowing: take([...cards].sort(by((c) => c.score?.growth))),
    sponsored: cards.filter((c) => c.sponsored).slice(0, 3),
  });
}));

r.get('/games', wrap(async (req, res) => {
  const q = req.query;
  const list = (v) => (v ? String(v).split(',').filter(Boolean) : []);
  const where = {};
  if (q.q) where.OR = [{ title: { contains: String(q.q).slice(0, 80), mode: 'insensitive' } }, { tagline: { contains: String(q.q).slice(0, 80), mode: 'insensitive' } }, { studio: { name: { contains: String(q.q).slice(0, 80), mode: 'insensitive' } } }];
  if (list(q.genre).length) where.genres = { hasSome: list(q.genre) };
  if (list(q.platform).length) where.platforms = { hasSome: list(q.platform) };
  if (list(q.stage).length) where.stage = { in: list(q.stage) };
  if (q.demo === 'true') where.demos = { some: { active: true } };
  if (q.status === 'released') where.stage = 'RELEASED';
  if (q.status === 'upcoming') where.stage = { not: 'RELEASED' };
  if (q.funding === 'true') where.campaigns = { some: { status: 'ACTIVE', adminApproved: true } };
  if (q.free === 'true') where.priceCents = 0;
  const pmax = Number(q.priceMax); if (Number.isFinite(pmax) && q.priceMax !== undefined && q.priceMax !== '') where.priceCents = { ...(where.priceCents && typeof where.priceCents === 'object' ? where.priceCents : {}), lte: pmax * 100 };
  const rd = q.releaseBefore ? new Date(String(q.releaseBefore)) : null;
  if (rd && !isNaN(rd)) where.releaseDate = { lte: rd };

  let cards = await loadCards(where);
  const minScore = Number(q.minScore), minRating = Number(q.minRating);
  if (minScore) cards = cards.filter((c) => (c.score?.total ?? 0) >= minScore);
  if (minRating) cards = cards.filter((c) => (c.rating ?? 0) >= minRating);
  const sort = String(q.sort || 'score');
  const sorters = {
    score: by((c) => c.score?.total), rating: by((c) => c.rating), new: by((c) => +new Date(c.createdAt)),
    funded: by((c) => c.funding?.raisedCents), growth: by((c) => c.score?.growth), followers: by((c) => c.followers),
    priceAsc: by((c) => c.priceCents, 1), priceDesc: by((c) => c.priceCents),
    release: by((c) => (c.releaseDate ? +new Date(c.releaseDate) : null), 1),
  };
  if (sort === 'trending') {
    const snaps = await prisma.trendingSnapshot.findMany({ orderBy: { weekStart: 'desc' }, take: 200 });
    const rank = new Map(snaps.filter((s) => s.weekStart.getTime() === snaps[0]?.weekStart.getTime()).map((s) => [s.gameId, s.rank]));
    cards.sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999));
  } else cards.sort(sorters[sort] ?? sorters.score);
  const page = Math.max(1, Number(q.page) || 1), size = 24;
  res.json({ total: cards.length, page, games: cards.slice((page - 1) * size, page * size) });
}));

r.get('/trending', wrap(async (_req, res) => {
  const snaps = await prisma.trendingSnapshot.findMany({ orderBy: [{ weekStart: 'desc' }, { rank: 'asc' }], take: 100 });
  if (!snaps.length) return res.json({ weekStart: null, items: [] });
  const ws = snaps[0].weekStart;
  const cur = snaps.filter((s) => s.weekStart.getTime() === ws.getTime());
  const prevWeek = new Date(ws.getTime() - 7 * 864e5);
  const prev = new Map((await prisma.trendingSnapshot.findMany({ where: { weekStart: prevWeek } })).map((s) => [s.gameId, s.rank]));
  const cards = await loadCards({ id: { in: cur.map((s) => s.gameId) } });
  const cmap = new Map(cards.map((c) => [c.id, c]));
  const since = new Date(Date.now() - 7 * 864e5);
  const items = [];
  for (const s of cur) {
    const c = cmap.get(s.gameId); if (!c) continue;
    const [players, weekWishlist, weekFollows] = await Promise.all([
      prisma.demoSession.count({ where: { gameId: c.id, startedAt: { gte: since } } }),
      prisma.wishlist.count({ where: { gameId: c.id, createdAt: { gte: since } } }),
      prisma.follow.count({ where: { gameId: c.id, createdAt: { gte: since } } }),
    ]);
    items.push({ rank: s.rank, change: prev.has(s.gameId) ? prev.get(s.gameId) - s.rank : null, isNew: !prev.has(s.gameId), players, weekWishlist, weekFollows, game: c });
  }
  res.json({ weekStart: ws, items });
}));

r.get('/games/:slug', wrap(async (req, res) => {
  const g = await prisma.game.findUnique({
    where: { slug: req.params.slug },
    include: {
      ...cardInclude,
      media: { orderBy: { order: 'asc' } }, demos: { where: { active: true } }, requirements: true,
      builds: { orderBy: { createdAt: 'desc' }, take: 5 }, dlcs: true,
      updates: { orderBy: { createdAt: 'desc' }, take: 10 },
      campaigns: { orderBy: { createdAt: 'desc' }, take: 1, include: { milestones: { orderBy: { order: 'asc' } }, rewards: { orderBy: { priceCents: 'asc' } } } },
    },
  });
  const isOwner = req.user && (req.user.role === 'ADMIN' || (req.user.developer?.studioId === g?.studioId));
  if (!g || (g.status !== 'PUBLISHED' && !isOwner)) throw httpError(404, 'Game not found');
  const camp = g.campaigns[0];
  const visibleCamp = camp && (camp.adminApproved || isOwner) ? camp : null;
  const [ratingAgg, rep, backersList, snap] = await Promise.all([
    prisma.review.aggregate({ where: { gameId: g.id, hidden: false }, _avg: { rating: true }, _count: true }),
    computeReputation(g.studioId),
    visibleCamp ? prisma.backing.findMany({ where: { campaignId: visibleCamp.id, transaction: { status: 'PAID' } }, orderBy: { createdAt: 'desc' }, take: 20, select: { user: { select: { name: true } }, createdAt: true } }) : [],
    prisma.trendingSnapshot.findFirst({ where: { gameId: g.id }, orderBy: { weekStart: 'desc' } }),
  ]);
  let me = null;
  if (req.user) {
    const [wish, follow, lib, review, backed] = await Promise.all([
      prisma.wishlist.findUnique({ where: { userId_gameId: { userId: req.user.id, gameId: g.id } } }),
      prisma.follow.findUnique({ where: { userId_gameId: { userId: req.user.id, gameId: g.id } } }),
      prisma.library.findMany({ where: { userId: req.user.id, gameId: g.id, revoked: false } }),
      prisma.review.findUnique({ where: { userId_gameId: { userId: req.user.id, gameId: g.id } } }),
      visibleCamp ? prisma.backing.findFirst({ where: { userId: req.user.id, campaignId: visibleCamp.id, transaction: { status: 'PAID' } } }) : null,
    ]);
    me = { wishlisted: !!wish, following: !!follow, owned: lib.some((l) => l.source !== 'DEMO'), backed: !!backed, review };
  }
  const card = toCard(g, { rating: ratingAgg._avg.rating ? +ratingAgg._avg.rating.toFixed(1) : null });
  res.json({
    ...card,
    status: g.status, rejectionNote: g.rejectionNote, description: g.description, tags: g.tags, ageRating: g.ageRating,
    publisherName: g.publisherName, trailerUrl: g.trailerUrl, lastUpdateAt: g.lastUpdateAt, createdAt: g.createdAt,
    media: g.media, demos: g.demos, requirements: g.requirements, builds: g.builds, dlcs: g.dlcs, updates: g.updates,
    scoreDetail: g.score, trendRank: snap?.rank ?? null, ratingCount: ratingAgg._count,
    campaign: visibleCamp && { ...visibleCamp, backers: backersList.map((b) => ({ name: b.user.name, at: b.createdAt })), daysLeft: Math.max(0, Math.ceil((visibleCamp.endsAt - Date.now()) / 864e5)) },
    studio: { ...card.studio, id: g.studio.id, country: g.studio.country, reputation: rep },
    me, riskNotice: g.stage !== 'RELEASED' ? 'This game is currently under development. Features, content and release dates may change.' : null,
  });
}));

// Page view counter (visitors). Cheap, rate-limited by the global limiter.
r.post('/games/:slug/view', wrap(async (req, res) => {
  const g = await prisma.game.findFirst({ where: { slug: req.params.slug, status: 'PUBLISHED' }, select: { id: true } });
  if (g) await bump(g.id, { visitors: 1 });
  res.json({ ok: true });
}));

r.get('/games/:slug/reviews', wrap(async (req, res) => {
  const g = await prisma.game.findUnique({ where: { slug: req.params.slug }, select: { id: true } });
  if (!g) throw httpError(404, 'Not found');
  const reviews = await prisma.review.findMany({ where: { gameId: g.id, hidden: false }, orderBy: { createdAt: 'desc' }, take: 50, include: { user: { select: { name: true } } } });
  res.json({ reviews: reviews.map((v) => ({ id: v.id, rating: v.rating, recommended: v.recommended, body: v.body, verified: v.verified, createdAt: v.createdAt, author: v.user.name })) });
}));

r.get('/games/:slug/comments', wrap(async (req, res) => {
  const g = await prisma.game.findUnique({ where: { slug: req.params.slug }, select: { id: true, studio: { select: { members: { select: { userId: true } } } } } });
  if (!g) throw httpError(404, 'Not found');
  const devIds = new Set(g.studio.members.map((m) => m.userId));
  const cs = await prisma.comment.findMany({ where: { gameId: g.id, hidden: false }, orderBy: { createdAt: 'desc' }, take: 100, include: { user: { select: { name: true } } } });
  res.json({ comments: cs.map((c) => ({ id: c.id, parentId: c.parentId, body: c.body, author: c.user.name, isDeveloper: devIds.has(c.userId), createdAt: c.createdAt })) });
}));

r.get('/studios/:slug', wrap(async (req, res) => {
  const s = await prisma.studio.findUnique({ where: { slug: req.params.slug }, include: { verification: { select: { status: true } } } });
  if (!s) throw httpError(404, 'Studio not found');
  const [rep, games, followers, updates, campaigns] = await Promise.all([
    computeReputation(s.id), loadCards({ studioId: s.id }),
    prisma.follow.count({ where: { game: { studioId: s.id } } }),
    prisma.gameUpdate.findMany({ where: { game: { studioId: s.id, status: 'PUBLISHED' } }, orderBy: { createdAt: 'desc' }, take: 8, include: { game: { select: { title: true, slug: true } } } }),
    prisma.campaign.findMany({ where: { game: { studioId: s.id }, adminApproved: true }, include: { game: { select: { title: true, slug: true } } }, orderBy: { createdAt: 'desc' } }),
  ]);
  const ratings = games.filter((g) => g.rating).map((g) => g.rating);
  res.json({
    studio: { id: s.id, name: s.name, slug: s.slug, country: s.country, description: s.description, website: s.website, memberSince: s.createdAt, verified: s.verification?.status === 'APPROVED' },
    reputation: rep, games, followers, updates, avgRating: ratings.length ? +(ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : null,
    campaigns: campaigns.map((c) => ({ id: c.id, title: c.title, game: c.game, status: c.status, goalCents: c.goalCents, raisedCents: c.raisedCents, backers: c.backersCount })),
  });
}));

export default r;
