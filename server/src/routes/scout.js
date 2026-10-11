// GAMEVEST SCOUT (V0): project discovery for publishers. Metrics are aggregated; no player identities.
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { wrap, requireRole } from '../middleware/auth.js';
import { validate, httpError } from '../lib/util.js';
import { notify } from '../lib/security.js';

const r = Router();
r.use(requireRole('PUBLISHER', 'ADMIN'));

r.get('/projects', wrap(async (req, res) => {
  const q = req.query;
  const where = { status: 'PUBLISHED' };
  if (q.genre) where.genres = { has: String(q.genre) };
  if (q.stage) where.stage = String(q.stage);
  if (q.country) where.studio = { country: { equals: String(q.country), mode: 'insensitive' } };
  const games = await prisma.game.findMany({ where, include: { score: true, studio: { include: { reputation: true, verification: { select: { status: true } } } }, campaigns: { where: { adminApproved: true }, take: 1, orderBy: { createdAt: 'desc' } }, _count: { select: { wishlist: true, follows: true } } } });
  const since = new Date(Date.now() - 60 * 864e5);
  const out = [];
  for (const g of games) {
    const [an, sess, done] = await Promise.all([
      prisma.gameAnalytics.findMany({ where: { gameId: g.id, date: { gte: since } } }),
      prisma.demoSession.count({ where: { gameId: g.id } }), prisma.demoSession.count({ where: { gameId: g.id, completed: true } }),
    ]);
    const half = new Date(Date.now() - 30 * 864e5);
    const cur = an.filter((a) => a.date >= half).reduce((s, a) => s + a.players, 0);
    const prev = an.filter((a) => a.date < half).reduce((s, a) => s + a.players, 0);
    const players = an.reduce((s, a) => s + a.players, 0);
    const c = g.campaigns[0];
    out.push({
      id: g.id, slug: g.slug, title: g.title, genres: g.genres, stage: g.stage, studio: { id: g.studio.id, name: g.studio.name, country: g.studio.country, verified: g.studio.verification?.status === 'APPROVED', reputation: g.studio.reputation?.score ?? null },
      score: g.score?.total ?? 0, players, wishlist: g._count.wishlist, followers: g._count.follows,
      demoCompletionPct: sess ? Math.round((100 * done) / sess) : null, monthlyGrowthPct: prev ? Math.round((100 * (cur - prev)) / prev) : null,
      fundingPct: c ? Math.round((100 * c.raisedCents) / c.goalCents) : null,
      coverSeed: g.coverSeed, coverUrl: g.coverUrl,
    });
  }
  const num = (k) => (q[k] !== undefined && q[k] !== '' ? Number(q[k]) : null);
  const filtered = out.filter((p) => (num('minScore') == null || p.score >= num('minScore')) && (num('minPlayers') == null || p.players >= num('minPlayers')) && (num('minWishlist') == null || p.wishlist >= num('minWishlist')) && (num('minCompletion') == null || (p.demoCompletionPct ?? 0) >= num('minCompletion')) && (num('minGrowth') == null || (p.monthlyGrowthPct ?? -999) >= num('minGrowth')));
  res.json({ projects: filtered.sort((a, b) => b.score - a.score) });
}));

r.post('/contact', wrap(async (req, res) => {
  if (!req.user.publisher) throw httpError(403, 'Publisher profile required');
  const d = validate(z.object({ studioId: z.string(), gameId: z.string().optional(), message: z.string().trim().min(20).max(2000) }), req.body);
  const dev = await prisma.developerProfile.findFirst({ where: { studioId: d.studioId } });
  if (!dev) throw httpError(404, 'Studio not found');
  const c = await prisma.contactRequest.create({ data: { ...d, publisherId: req.user.id } });
  await notify(dev.userId, 'publisher_contact', `${req.user.publisher.company} wants to talk`, d.message.slice(0, 200), '/developer');
  res.status(201).json({ contact: c });
}));

export default r;
