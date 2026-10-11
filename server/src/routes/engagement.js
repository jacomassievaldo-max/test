import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { prisma } from '../db.js';
import { wrap, requireAuth } from '../middleware/auth.js';
import { validate, httpError } from '../lib/util.js';
import { bump } from '../lib/analytics.js';
import { notify, secLog } from '../lib/security.js';
import { computeScore } from '../lib/score.js';
import { checkReviewAbuse } from '../lib/fraud.js';
import { loadCards } from '../lib/cards.js';

const r = Router();
const writeLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Slow down a little.' } });

const gameBySlug = async (slug) => {
  const g = await prisma.game.findFirst({ where: { slug, status: 'PUBLISHED' }, include: { studio: { include: { members: true } } } });
  if (!g) throw httpError(404, 'Game not found');
  return g;
};

// ---- wishlist / follow (toggle; one row per user+game => cannot be inflated) ----
for (const [path, model, field] of [['wishlist', 'wishlist', 'wishlists'], ['follow', 'follow', 'follows']]) {
  r.post(`/games/:slug/${path}`, requireAuth, writeLimiter, wrap(async (req, res) => {
    const g = await gameBySlug(req.params.slug);
    const key = { userId_gameId: { userId: req.user.id, gameId: g.id } };
    const existing = await prisma[model].findUnique({ where: key });
    if (existing) { await prisma[model].delete({ where: key }); await bump(g.id, { [field]: -1 }); }
    else {
      await prisma[model].create({ data: { userId: req.user.id, gameId: g.id } });
      await bump(g.id, { [field]: 1 });
      const dev = g.studio.members[0];
      if (path === 'follow' && dev) await notify(dev.userId, 'follow', `New follower on ${g.title}`, null, `/developer/dashboard`);
    }
    computeScore(g.id).catch(() => {});
    res.json({ active: !existing });
  }));
}

r.get('/me/wishlist', requireAuth, wrap(async (req, res) => {
  const rows = await prisma.wishlist.findMany({ where: { userId: req.user.id }, select: { gameId: true } });
  res.json({ games: await loadCards({ id: { in: rows.map((x) => x.gameId) } }) });
}));
r.get('/me/following', requireAuth, wrap(async (req, res) => {
  const rows = await prisma.follow.findMany({ where: { userId: req.user.id }, select: { gameId: true } });
  const games = await loadCards({ id: { in: rows.map((x) => x.gameId) } });
  const updates = await prisma.gameUpdate.findMany({ where: { gameId: { in: rows.map((x) => x.gameId) } }, orderBy: { createdAt: 'desc' }, take: 20, include: { game: { select: { title: true, slug: true } } } });
  res.json({ games, updates });
}));

// ---- reviews ----
const reviewSchema = z.object({ rating: z.number().int().min(1).max(5), recommended: z.boolean(), body: z.string().trim().min(10).max(2000) });
r.post('/games/:slug/reviews', requireAuth, writeLimiter, wrap(async (req, res) => {
  const g = await gameBySlug(req.params.slug);
  if (g.studio.members.some((m) => m.userId === req.user.id)) throw httpError(403, 'Developers cannot review their own game');
  const d = validate(reviewSchema, req.body);
  const [played, owns] = await Promise.all([
    prisma.demoSession.count({ where: { gameId: g.id, userId: req.user.id, durationSec: { gte: 60 } } }),
    prisma.library.count({ where: { gameId: g.id, userId: req.user.id, revoked: false } }),
  ]);
  const verified = played > 0 || owns > 0;
  const review = await prisma.review.upsert({
    where: { userId_gameId: { userId: req.user.id, gameId: g.id } },
    create: { ...d, userId: req.user.id, gameId: g.id, verified },
    update: { ...d, verified },
  });
  await checkReviewAbuse(req.user, g.id, req.ip);
  computeScore(g.id).catch(() => {});
  res.status(201).json({ review });
}));
r.delete('/games/:slug/reviews', requireAuth, wrap(async (req, res) => {
  const g = await gameBySlug(req.params.slug);
  await prisma.review.deleteMany({ where: { userId: req.user.id, gameId: g.id } });
  computeScore(g.id).catch(() => {});
  res.json({ ok: true });
}));

// ---- comments ----
r.post('/games/:slug/comments', requireAuth, writeLimiter, wrap(async (req, res) => {
  const g = await gameBySlug(req.params.slug);
  const d = validate(z.object({ body: z.string().trim().min(1).max(1000), parentId: z.string().optional() }), req.body);
  if (d.parentId && !(await prisma.comment.findFirst({ where: { id: d.parentId, gameId: g.id } }))) throw httpError(400, 'Invalid parent');
  const c = await prisma.comment.create({ data: { ...d, userId: req.user.id, gameId: g.id } });
  const dev = g.studio.members[0];
  if (dev && dev.userId !== req.user.id) await notify(dev.userId, 'comment', `New comment on ${g.title}`, d.body.slice(0, 120), `/games/${g.slug}`);
  res.status(201).json({ comment: c });
}));

// ---- demo play sessions + post-play survey ----
r.post('/games/:slug/demo/start', writeLimiter, wrap(async (req, res) => {
  const g = await gameBySlug(req.params.slug);
  const s = await prisma.demoSession.create({ data: { gameId: g.id, userId: req.user?.id ?? null } });
  await bump(g.id, { players: 1 });
  if (req.user) {
    const prev = await prisma.demoSession.count({ where: { gameId: g.id, userId: req.user.id } });
    if (prev > 1) await bump(g.id, { returningPlayers: 1 });
    await prisma.library.upsert({ where: { userId_gameId_source: { userId: req.user.id, gameId: g.id, source: 'DEMO' } }, create: { userId: req.user.id, gameId: g.id, source: 'DEMO' }, update: {} });
  }
  res.status(201).json({ sessionId: s.id });
}));

r.post('/demo/:sessionId/heartbeat', wrap(async (req, res) => {
  const d = validate(z.object({ durationSec: z.number().int().min(0).max(6 * 3600), completed: z.boolean().optional() }), req.body);
  const s = await prisma.demoSession.findUnique({ where: { id: req.params.sessionId } });
  if (!s || (s.userId && s.userId !== req.user?.id)) throw httpError(404, 'Session not found');
  // Duration may only grow, and never faster than wall-clock time since start (+ slack).
  const maxPlausible = Math.ceil((Date.now() - s.startedAt.getTime()) / 1000) + 5;
  const durationSec = Math.min(Math.max(s.durationSec, d.durationSec), maxPlausible);
  const wasCompleted = s.completed;
  await prisma.demoSession.update({ where: { id: s.id }, data: { durationSec, completed: d.completed ?? s.completed } });
  if (d.completed && !wasCompleted) await bump(s.gameId, { demoCompletions: 1 });
  res.json({ ok: true });
}));

const feedbackSchema = z.object({
  rating: z.number().int().min(1).max(5), wouldPlayAgain: z.boolean(), wouldBuy: z.boolean(),
  priceCents: z.number().int().min(0).max(100000).optional(), improve: z.string().trim().max(500).optional(),
});
r.post('/demo/:sessionId/feedback', writeLimiter, wrap(async (req, res) => {
  const d = validate(feedbackSchema, req.body);
  const s = await prisma.demoSession.findUnique({ where: { id: req.params.sessionId } });
  if (!s || (s.userId && s.userId !== req.user?.id)) throw httpError(404, 'Session not found');
  if (s.durationSec < 20) throw httpError(400, 'Play the demo a little longer before rating it');
  await prisma.demoFeedback.upsert({ where: { sessionId: s.id }, create: { ...d, sessionId: s.id, gameId: s.gameId }, update: d });
  computeScore(s.gameId).catch(() => {});
  res.status(201).json({ ok: true });
}));

// ---- reports ----
r.post('/reports', requireAuth, rateLimit({ windowMs: 3600_000, limit: 15, message: { error: 'Report limit reached' } }), wrap(async (req, res) => {
  const d = validate(z.object({
    gameId: z.string().optional(), studioId: z.string().optional(),
    reason: z.enum(['SCAM', 'STOLEN_CONTENT', 'FAKE_DEVELOPER', 'MISLEADING', 'ABANDONED', 'OTHER']),
    details: z.string().trim().max(1500).optional(),
  }).refine((x) => x.gameId || x.studioId, 'gameId or studioId required'), req.body);
  if (d.gameId) {
    const g = await prisma.game.findUnique({ where: { id: d.gameId } });
    if (!g) throw httpError(404, 'Game not found');
    d.studioId = d.studioId ?? g.studioId;
  }
  const dup = await prisma.report.findFirst({ where: { reporterId: req.user.id, gameId: d.gameId ?? null, studioId: d.studioId ?? null, status: { in: ['OPEN', 'REVIEWING'] } } });
  if (dup) throw httpError(409, 'You already have an open report for this project');
  const rep = await prisma.report.create({ data: { ...d, reporterId: req.user.id } });
  // auto-escalate: many distinct open reports on one game => notify as a security signal
  if (d.gameId) {
    const n = await prisma.report.count({ where: { gameId: d.gameId, status: 'OPEN' } });
    if (n >= 3) await secLog('report_cluster', { detail: `game ${d.gameId} has ${n} open reports`, severity: 'high' });
  }
  res.status(201).json({ report: rep });
}));

// ---- notifications ----
r.get('/notifications', requireAuth, wrap(async (req, res) => {
  const items = await prisma.notification.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' }, take: 30 });
  res.json({ items, unread: items.filter((i) => !i.read).length });
}));
r.post('/notifications/read', requireAuth, wrap(async (req, res) => {
  await prisma.notification.updateMany({ where: { userId: req.user.id, read: false }, data: { read: true } });
  res.json({ ok: true });
}));

export default r;
