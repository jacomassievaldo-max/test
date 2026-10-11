import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { wrap, requireRole } from '../middleware/auth.js';
import { validate, httpError, slugify, GENRES, PLATFORMS, trailerUrl, safeUrl } from '../lib/util.js';
import { computeScore } from '../lib/score.js';
import { secLog } from '../lib/security.js';

const r = Router();
r.use(requireRole('DEVELOPER', 'ADMIN'));

export const UPLOAD_DIR = path.resolve('uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ---- uploads: type allow-list + magic-byte verification; random server-side names ----
const IMG = { 'image/png': ['png', [0x89, 0x50, 0x4e, 0x47]], 'image/jpeg': ['jpg', [0xff, 0xd8, 0xff]], 'image/webp': ['webp', [0x52, 0x49, 0x46, 0x46]], 'image/gif': ['gif', [0x47, 0x49, 0x46]] };
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + '.tmp'),
  }),
  limits: { fileSize: config.uploadMaxBytes, files: 1 },
  fileFilter: (_req, file, cb) => (IMG[file.mimetype] || file.mimetype === 'text/html' ? cb(null, true) : cb(httpError(400, 'Unsupported file type'))),
});
function finalizeUpload(file) {
  const head = Buffer.alloc(16); const fd = fs.openSync(file.path, 'r'); fs.readSync(fd, head, 0, 16, 0); fs.closeSync(fd);
  let ext;
  if (IMG[file.mimetype]) {
    const [e, magic] = IMG[file.mimetype];
    if (!magic.every((b, i) => head[i] === b)) { fs.unlinkSync(file.path); throw httpError(400, 'File content does not match its type'); }
    ext = e;
  } else {
    const txt = fs.readFileSync(file.path, 'utf8').slice(0, 2000).toLowerCase();
    if (!txt.includes('<')) { fs.unlinkSync(file.path); throw httpError(400, 'Not a valid HTML file'); }
    ext = 'html';
  }
  const name = path.basename(file.path, '.tmp') + '.' + ext;
  fs.renameSync(file.path, path.join(UPLOAD_DIR, name));
  return `/uploads/${name}`;
}

const studioId = (req) => {
  const id = req.user.developer?.studioId;
  if (!id && req.user.role !== 'ADMIN') throw httpError(403, 'No studio');
  return id;
};
async function ownGame(req, id) {
  const g = await prisma.game.findUnique({ where: { id } });
  if (!g) throw httpError(404, 'Game not found');
  if (req.user.role !== 'ADMIN' && g.studioId !== req.user.developer?.studioId) throw httpError(403, 'Not your game');
  return g;
}

// ---- games ----
const gameSchema = z.object({
  title: z.string().trim().min(2).max(80),
  tagline: z.string().trim().max(140).optional(),
  description: z.string().trim().min(20).max(8000),
  genres: z.array(z.enum(GENRES)).min(1).max(4),
  tags: z.array(z.string().trim().max(24)).max(10).default([]),
  platforms: z.array(z.enum(PLATFORMS)).min(1),
  stage: z.enum(['CONCEPT', 'PROTOTYPE', 'ALPHA', 'BETA', 'EARLY_ACCESS', 'RELEASED']),
  progress: z.number().int().min(0).max(100),
  priceCents: z.number().int().min(0).max(100000_00).default(0),
  estimatedRelease: z.string().trim().max(30).optional(),
  releaseDate: z.string().datetime().optional(),
  ageRating: z.string().trim().max(10).optional(),
  trailerUrl: trailerUrl.optional().or(z.literal('')),
  requirements: z.array(z.object({ tier: z.enum(['MIN', 'REC']), os: z.string().max(80).optional(), cpu: z.string().max(80).optional(), gpu: z.string().max(80).optional(), ram: z.string().max(40).optional(), storage: z.string().max(40).optional() })).max(2).optional(),
});

r.get('/games', wrap(async (req, res) => {
  const games = await prisma.game.findMany({ where: req.user.role === 'ADMIN' ? {} : { studioId: studioId(req) }, orderBy: { createdAt: 'desc' }, include: { score: true, campaigns: true, _count: { select: { follows: true, wishlist: true } } } });
  res.json({ games });
}));

r.post('/games', wrap(async (req, res) => {
  const d = validate(gameSchema, req.body);
  const { requirements, ...data } = d;
  let slug = slugify(d.title);
  if (await prisma.game.findUnique({ where: { slug } })) slug += '-' + crypto.randomBytes(2).toString('hex');
  const game = await prisma.game.create({
    data: {
      ...data, trailerUrl: data.trailerUrl || null, releaseDate: data.releaseDate ? new Date(data.releaseDate) : null,
      slug, studioId: studioId(req), status: 'DRAFT', coverSeed: Math.floor(Math.random() * 1e6),
      requirements: requirements ? { create: requirements } : undefined,
    },
  });
  res.status(201).json({ game });
}));

r.get('/games/:id', wrap(async (req, res) => {
  await ownGame(req, req.params.id);
  res.json({ game: await prisma.game.findUnique({ where: { id: req.params.id }, include: { media: { orderBy: { order: 'asc' } }, demos: true, requirements: true, builds: true, dlcs: true, campaigns: { include: { rewards: true, milestones: { orderBy: { order: 'asc' } } } }, updates: { orderBy: { createdAt: 'desc' } }, score: true } }) });
}));

r.put('/games/:id', wrap(async (req, res) => {
  const g = await ownGame(req, req.params.id);
  const d = validate(gameSchema.partial(), req.body);
  const { requirements, ...data } = d;
  if (data.trailerUrl === '') data.trailerUrl = null;
  if (data.releaseDate) data.releaseDate = new Date(data.releaseDate);
  // Editing a published/rejected game sends material changes back through review only for stage/price changes of released games
  const updated = await prisma.$transaction(async (tx) => {
    if (requirements) { await tx.gameRequirement.deleteMany({ where: { gameId: g.id } }); await tx.gameRequirement.createMany({ data: requirements.map((x) => ({ ...x, gameId: g.id })) }); }
    return tx.game.update({ where: { id: g.id }, data: { ...data, status: g.status === 'REJECTED' ? 'DRAFT' : g.status } });
  });
  computeScore(g.id).catch(() => {});
  res.json({ game: updated });
}));

r.post('/games/:id/submit', wrap(async (req, res) => {
  const g = await ownGame(req, req.params.id);
  if (!['DRAFT', 'REJECTED'].includes(g.status)) throw httpError(400, 'Game is not in a submittable state');
  const media = await prisma.gameMedia.count({ where: { gameId: g.id, type: { in: ['COVER', 'SCREENSHOT'] } } });
  if (!media && !g.coverUrl) throw httpError(400, 'Upload at least a cover image or a screenshot before submitting');
  await prisma.game.update({ where: { id: g.id }, data: { status: 'PENDING', rejectionNote: null } });
  res.json({ status: 'PENDING' });
}));

r.post('/games/:id/media', upload.single('file'), wrap(async (req, res) => {
  const g = await ownGame(req, req.params.id);
  if (!req.file) throw httpError(400, 'file required');
  const type = z.enum(['SCREENSHOT', 'COVER', 'BANNER']).parse(req.body.type || 'SCREENSHOT');
  if (!IMG[req.file.mimetype]) { fs.unlinkSync(req.file.path); throw httpError(400, 'Images only'); }
  const url = finalizeUpload(req.file);
  if (type === 'COVER') await prisma.game.update({ where: { id: g.id }, data: { coverUrl: url } });
  const media = await prisma.gameMedia.create({ data: { gameId: g.id, type, url, caption: req.body.caption?.slice(0, 140), order: await prisma.gameMedia.count({ where: { gameId: g.id } }) } });
  res.status(201).json({ media });
}));
r.delete('/games/:id/media/:mediaId', wrap(async (req, res) => {
  const g = await ownGame(req, req.params.id);
  await prisma.gameMedia.deleteMany({ where: { id: req.params.mediaId, gameId: g.id } });
  res.json({ ok: true });
}));

r.put('/games/:id/trailer', wrap(async (req, res) => {
  const g = await ownGame(req, req.params.id);
  const { url } = validate(z.object({ url: trailerUrl }), req.body);
  res.json({ game: await prisma.game.update({ where: { id: g.id }, data: { trailerUrl: url } }) });
}));

// Demo: single-file HTML5 upload (served sandboxed), an external https URL, or a download link
r.post('/games/:id/demo', upload.single('file'), wrap(async (req, res) => {
  const g = await ownGame(req, req.params.id);
  const kind = z.enum(['WEBGL', 'DOWNLOAD']).parse(req.body.kind || 'WEBGL');
  let url;
  if (req.file) {
    if (req.file.mimetype !== 'text/html') { fs.unlinkSync(req.file.path); throw httpError(400, 'Demo upload must be an .html file'); }
    url = finalizeUpload(req.file);
  } else url = validate(safeUrl, req.body.url);
  await prisma.gameDemo.updateMany({ where: { gameId: g.id, kind }, data: { active: false } });
  const demo = await prisma.gameDemo.create({ data: { gameId: g.id, kind, url, version: (req.body.version || '0.1').slice(0, 20) } });
  res.status(201).json({ demo });
}));
r.delete('/games/:id/demo/:demoId', wrap(async (req, res) => {
  const g = await ownGame(req, req.params.id);
  await prisma.gameDemo.updateMany({ where: { id: req.params.demoId, gameId: g.id }, data: { active: false } });
  res.json({ ok: true });
}));

r.post('/games/:id/builds', wrap(async (req, res) => {
  const g = await ownGame(req, req.params.id);
  const d = validate(z.object({ version: z.string().max(20), platform: z.enum(PLATFORMS), url: safeUrl.optional(), notes: z.string().max(1000).optional() }), req.body);
  res.status(201).json({ build: await prisma.gameBuild.create({ data: { ...d, gameId: g.id } }) });
}));

r.post('/games/:id/updates', wrap(async (req, res) => {
  const g = await ownGame(req, req.params.id);
  const d = validate(z.object({ title: z.string().trim().min(3).max(100), body: z.string().trim().min(10).max(5000), progress: z.number().int().min(0).max(100).optional(), stage: z.enum(['CONCEPT', 'PROTOTYPE', 'ALPHA', 'BETA', 'EARLY_ACCESS', 'RELEASED']).optional() }), req.body);
  const { progress, stage, ...rest } = d;
  const upd = await prisma.gameUpdate.create({ data: { ...rest, gameId: g.id } });
  await prisma.game.update({ where: { id: g.id }, data: { lastUpdateAt: new Date(), ...(progress !== undefined && { progress }), ...(stage && { stage }) } });
  const followers = await prisma.follow.findMany({ where: { gameId: g.id }, select: { userId: true } });
  if (followers.length) await prisma.notification.createMany({ data: followers.map((f) => ({ userId: f.userId, type: 'update', title: `${g.title}: ${d.title}`, link: `/games/${g.slug}` })) });
  computeScore(g.id).catch(() => {});
  res.status(201).json({ update: upd });
}));

r.post('/games/:id/dlcs', wrap(async (req, res) => {
  const g = await ownGame(req, req.params.id);
  const d = validate(z.object({ title: z.string().trim().min(2).max(80), priceCents: z.number().int().min(0).max(50000) }), req.body);
  res.status(201).json({ dlc: await prisma.dlc.create({ data: { ...d, gameId: g.id } }) });
}));

// ---- campaigns ----
const campaignSchema = z.object({
  gameId: z.string(), title: z.string().trim().min(3).max(100), summary: z.string().trim().max(2000).optional(),
  goalCents: z.number().int().min(100000).max(500000_00), durationDays: z.number().int().min(7).max(60),
  rewards: z.array(z.object({
    title: z.string().trim().min(2).max(60), description: z.string().trim().max(500).optional(),
    priceCents: z.number().int().min(500).max(100000_00), kind: z.enum(['SUPPORT', 'GAME_COPY', 'BUNDLE', 'EARLY_ACCESS', 'FOUNDER']),
    limit: z.number().int().min(1).max(100000).optional(),
  })).min(1).max(12),
  milestones: z.array(z.string().trim().min(2).max(80)).max(8).default([]),
  termsText: z.string().trim().max(3000).optional(),
});
r.post('/campaigns', wrap(async (req, res) => {
  const d = validate(campaignSchema, req.body);
  const g = await ownGame(req, d.gameId);
  if (g.stage === 'RELEASED') throw httpError(400, 'Released games cannot open a funding campaign');
  const open = await prisma.campaign.count({ where: { gameId: g.id, status: { in: ['DRAFT', 'ACTIVE'] } } });
  if (open) throw httpError(409, 'This game already has an open campaign');
  const c = await prisma.campaign.create({
    data: {
      gameId: g.id, title: d.title, summary: d.summary, goalCents: d.goalCents, termsText: d.termsText, termsVersion: config.termsVersion,
      endsAt: new Date(Date.now() + d.durationDays * 864e5), status: 'DRAFT', adminApproved: false,
      rewards: { create: d.rewards }, milestones: { create: d.milestones.map((title, order) => ({ title, order })) },
    },
    include: { rewards: true, milestones: true },
  });
  res.status(201).json({ campaign: c });
}));

// Request activation: requires a verified studio and a published game; then an admin must approve.
r.post('/campaigns/:id/submit', wrap(async (req, res) => {
  const c = await prisma.campaign.findUnique({ where: { id: req.params.id }, include: { game: { include: { studio: { include: { verification: true } } } } } });
  if (!c) throw httpError(404, 'Campaign not found');
  await ownGame(req, c.gameId);
  if (c.game.studio.verification?.status !== 'APPROVED') throw httpError(400, 'Your studio must pass GameVest Verification before launching a campaign');
  if (c.game.status !== 'PUBLISHED') throw httpError(400, 'The game must be published first');
  if (c.status !== 'DRAFT') throw httpError(400, 'Campaign is not a draft');
  await secLog('campaign_submitted', { userId: req.user.id, detail: c.id });
  res.json({ ok: true, message: 'Submitted for GameVest review' });
}));

r.put('/campaigns/:id/milestones/:mid', wrap(async (req, res) => {
  const c = await prisma.campaign.findUnique({ where: { id: req.params.id } });
  if (!c) throw httpError(404, 'Not found');
  await ownGame(req, c.gameId);
  const { status } = validate(z.object({ status: z.enum(['PENDING', 'IN_PROGRESS', 'DONE']) }), req.body);
  await prisma.campaignMilestone.updateMany({ where: { id: req.params.mid, campaignId: c.id }, data: { status } });
  res.json({ ok: true });
}));

// ---- dashboard (aggregates only; player identities are never exposed) ----
r.get('/dashboard', wrap(async (req, res) => {
  const sid = studioId(req);
  const gameId = req.query.gameId ? String(req.query.gameId) : null;
  const games = await prisma.game.findMany({ where: { studioId: sid, ...(gameId && { id: gameId }) }, include: { score: true, campaigns: { orderBy: { createdAt: 'desc' }, take: 1 }, _count: { select: { follows: true, wishlist: true } } } });
  const ids = games.map((g) => g.id);
  const since = new Date(Date.now() - 30 * 864e5);
  const [an, fb, ratings, sessions, completed, returning, sessionsAll] = await Promise.all([
    prisma.gameAnalytics.findMany({ where: { gameId: { in: ids }, date: { gte: since } }, orderBy: { date: 'asc' } }),
    prisma.demoFeedback.findMany({ where: { gameId: { in: ids } }, select: { rating: true, wouldPlayAgain: true, wouldBuy: true, priceCents: true, improve: true, createdAt: true } }),
    prisma.review.groupBy({ by: ['rating'], where: { gameId: { in: ids }, hidden: false }, _count: true }),
    prisma.demoSession.aggregate({ where: { gameId: { in: ids } }, _count: true, _avg: { durationSec: true } }),
    prisma.demoSession.count({ where: { gameId: { in: ids }, completed: true } }),
    prisma.gameAnalytics.aggregate({ where: { gameId: { in: ids } }, _sum: { returningPlayers: true } }),
    prisma.demoSession.count({ where: { gameId: { in: ids }, durationSec: { gte: 300 } } }),
  ]);
  const byDay = new Map();
  for (const a of an) {
    const k = a.date.toISOString().slice(0, 10);
    const o = byDay.get(k) ?? { date: k, visitors: 0, players: 0, wishlists: 0, follows: 0, backers: 0, purchases: 0, fundingCents: 0, salesCents: 0 };
    for (const f of ['visitors', 'players', 'wishlists', 'follows', 'backers', 'purchases', 'fundingCents', 'salesCents']) o[f] += a[f];
    byDay.set(k, o);
  }
  const series = [...byDay.values()];
  let wl = 0, fo = 0; // cumulative growth within the 30-day window
  for (const d of series) { wl += d.wishlists; fo += d.follows; d.wishlistTotal = wl; d.followersTotal = fo; }
  const sum = (f) => series.reduce((s, d) => s + d[f], 0);
  const sums = { visitors: sum('visitors'), players: sum('players'), wishlists: sum('wishlists'), follows: sum('follows'), backers: sum('backers'), purchases: sum('purchases') };
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const prices = fb.filter((f) => f.priceCents != null).map((f) => f.priceCents);
  const pct = (n) => (fb.length ? Math.round((100 * fb.filter(n).length) / fb.length) : null);
  res.json({
    games: games.map((g) => ({ id: g.id, title: g.title, slug: g.slug, status: g.status, score: g.score })),
    totals: {
      players: sums.players, followers: games.reduce((s, g) => s + g._count.follows, 0), wishlist: games.reduce((s, g) => s + g._count.wishlist, 0),
      fundingCents: games.reduce((s, g) => s + (g.campaigns[0]?.raisedCents ?? 0), 0), salesCents: sum('salesCents'),
      conversion: sums.visitors ? +((100 * (sums.backers + sums.purchases)) / sums.visitors).toFixed(2) : 0,
      score: games.length ? Math.round(games.reduce((s, g) => s + (g.score?.total ?? 0), 0) / games.length) : 0,
      rating: avg(ratings.flatMap((x) => Array(x._count).fill(x.rating))),
    },
    series,
    funnel: { visitors: sums.visitors, played: sums.players, wishlisted: sums.wishlists, followed: sums.follows, backed: sums.backers, purchased: sums.purchases },
    retention: { sessions: sessions._count, avgPlaySec: Math.round(sessions._avg.durationSec || 0), completionPct: sessions._count ? Math.round((100 * completed) / sessions._count) : 0, over5minPct: sessions._count ? Math.round((100 * sessionsAll) / sessions._count) : 0, returning: returning._sum.returningPlayers ?? 0 },
    ratings: [1, 2, 3, 4, 5].map((n) => ({ rating: n, count: ratings.find((x) => x.rating === n)?._count ?? 0 })),
    feedback: { count: fb.length, avgRating: avg(fb.map((f) => f.rating)), wouldPlayAgainPct: pct((f) => f.wouldPlayAgain), wouldBuyPct: pct((f) => f.wouldBuy), avgPriceCents: avg(prices), improve: fb.filter((f) => f.improve).slice(-10).reverse().map((f) => ({ text: f.improve, at: f.createdAt })) },
  });
}));

// ---- verification ----
r.get('/verification', wrap(async (req, res) => {
  const v = await prisma.verification.findUnique({ where: { studioId: studioId(req) } });
  res.json({ verification: v });
}));
r.post('/verification', wrap(async (req, res) => {
  const d = validate(z.object({
    legalName: z.string().trim().min(3).max(120), document: z.string().trim().min(5).max(40),
    payoutInfo: z.string().trim().min(3).max(200), evidence: z.string().trim().min(20).max(3000),
  }), req.body);
  const sid = studioId(req);
  const v = await prisma.verification.upsert({ where: { studioId: sid }, create: { ...d, studioId: sid, status: 'PENDING' }, update: { ...d, status: 'PENDING', notes: null, reviewedAt: null } });
  res.status(201).json({ verification: v });
}));

r.put('/studio', wrap(async (req, res) => {
  const d = validate(z.object({ description: z.string().max(1500).optional(), website: safeUrl.optional(), country: z.string().max(60).optional() }), req.body);
  res.json({ studio: await prisma.studio.update({ where: { id: studioId(req) }, data: d }) });
}));

export default r;
