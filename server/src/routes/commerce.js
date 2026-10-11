import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { wrap, requireAuth } from '../middleware/auth.js';
import { validate, httpError } from '../lib/util.js';
import { provider, signPayload, verifySignature } from '../lib/payments.js';
import { assessPayment } from '../lib/fraud.js';
import { bump } from '../lib/analytics.js';
import { notify, secLog } from '../lib/security.js';
import { computeScore } from '../lib/score.js';
import { getPolicies } from '../lib/policies.js';

const r = Router();
const payLimiter = rateLimit({ windowMs: 10 * 60_000, limit: 15, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many payment attempts' } });
const termsSchema = z.object({ acceptTerms: z.literal(true, { errorMap: () => ({ message: 'You must accept the terms and refund policy' }) }), termsVersion: z.string() });
const assertTerms = (d) => { if (d.termsVersion !== config.termsVersion) throw httpError(409, 'Terms have been updated. Please review them and try again.'); };

// ---------- backing (crowdfunding with rewards; NOT an investment) ----------
r.post('/campaigns/:id/back', requireAuth, payLimiter, wrap(async (req, res) => {
  const d = validate(termsSchema.extend({ rewardId: z.string().optional(), amountCents: z.number().int().min(500).max(500000_00) }), req.body);
  assertTerms(d);
  const c = await prisma.campaign.findUnique({ where: { id: req.params.id }, include: { game: { include: { studio: { include: { members: true } } } } } });
  if (!c || c.status !== 'ACTIVE' || !c.adminApproved || c.endsAt < new Date()) throw httpError(400, 'This campaign is not accepting support');
  if (c.game.studio.members.some((m) => m.userId === req.user.id)) throw httpError(403, 'You cannot back your own campaign');
  let reward = null;
  if (d.rewardId) {
    reward = await prisma.reward.findFirst({ where: { id: d.rewardId, campaignId: c.id } });
    if (!reward) throw httpError(400, 'Invalid reward');
    if (reward.limit != null && reward.claimed >= reward.limit) throw httpError(409, 'This reward is sold out');
    if (d.amountCents < reward.priceCents) throw httpError(400, `Minimum for this reward is ${reward.priceCents / 100}`);
  }
  const risk = await assessPayment(req.user, d.amountCents, req.ip);
  if (!risk.allowed) throw httpError(403, 'We could not process this payment. Please contact support.');
  const out = await provider().createCheckout({ amountCents: d.amountCents });
  const now = new Date();
  const backing = await prisma.$transaction(async (tx) => {
    const t = await tx.transaction.create({ data: { userId: req.user.id, kind: 'BACKING', amountCents: d.amountCents, provider: config.paymentsProvider, providerRef: out.providerRef, ip: req.ip, meta: { campaignId: c.id, rewardId: reward?.id ?? null } } });
    return tx.backing.create({ data: { userId: req.user.id, campaignId: c.id, rewardId: reward?.id, amountCents: d.amountCents, transactionId: t.id, termsVersion: d.termsVersion, termsAcceptedAt: now, deliveryStatus: reward && reward.kind !== 'SUPPORT' ? 'PENDING' : 'NOT_APPLICABLE' } });
  });
  res.status(201).json({ transactionId: backing.transactionId, checkoutUrl: out.checkoutUrl, requiresConfirm: out.requiresConfirm, providerRef: out.providerRef });
}));

// ---------- store purchases ----------
r.post('/store/games/:slug/buy', requireAuth, payLimiter, wrap(async (req, res) => {
  const d = validate(termsSchema.extend({ dlcId: z.string().optional() }), req.body);
  assertTerms(d);
  const g = await prisma.game.findFirst({ where: { slug: req.params.slug, status: 'PUBLISHED' }, include: { dlcs: true, studio: { include: { members: true } } } });
  if (!g) throw httpError(404, 'Game not found');
  if (g.studio.members.some((m) => m.userId === req.user.id)) throw httpError(403, 'You cannot buy your own game');
  let kind, title, price;
  if (d.dlcId) {
    const dlc = g.dlcs.find((x) => x.id === d.dlcId); if (!dlc) throw httpError(404, 'DLC not found');
    if (!(await prisma.library.count({ where: { userId: req.user.id, gameId: g.id, revoked: false, source: { not: 'DEMO' } } }))) throw httpError(400, 'You need the base game first');
    kind = 'DLC'; title = dlc.title; price = dlc.priceCents;
  } else {
    if (!['RELEASED', 'EARLY_ACCESS'].includes(g.stage)) throw httpError(400, 'This game is not on sale yet. Add it to your wishlist or back its campaign.');
    kind = g.stage === 'EARLY_ACCESS' ? 'EARLY_ACCESS' : 'GAME'; title = g.title; price = g.priceCents;
  }
  const dupe = await prisma.purchase.findFirst({ where: { userId: req.user.id, gameId: g.id, itemTitle: title, transaction: { status: { in: ['PAID', 'PENDING'] } } } });
  if (dupe && dupe.transactionId) { const t = await prisma.transaction.findUnique({ where: { id: dupe.transactionId } }); if (t.status === 'PAID') throw httpError(409, 'You already own this'); }
  const now = new Date();
  if (price === 0) {
    await prisma.library.upsert({ where: { userId_gameId_source: { userId: req.user.id, gameId: g.id, source: 'PURCHASE' } }, create: { userId: req.user.id, gameId: g.id, source: 'PURCHASE' }, update: { revoked: false } });
    return res.status(201).json({ free: true });
  }
  const risk = await assessPayment(req.user, price, req.ip);
  if (!risk.allowed) throw httpError(403, 'We could not process this payment. Please contact support.');
  const out = await provider().createCheckout({ amountCents: price });
  const p = await prisma.$transaction(async (tx) => {
    const t = await tx.transaction.create({ data: { userId: req.user.id, kind: 'PURCHASE', amountCents: price, provider: config.paymentsProvider, providerRef: out.providerRef, ip: req.ip, meta: { gameId: g.id, dlcId: d.dlcId ?? null } } });
    return tx.purchase.create({ data: { userId: req.user.id, gameId: g.id, kind, itemTitle: title, amountCents: price, transactionId: t.id, termsVersion: d.termsVersion, termsAcceptedAt: now, commissionCents: Math.round((price * config.platformFeeBps.sales) / 10000) } });
  });
  res.status(201).json({ transactionId: p.transactionId, checkoutUrl: out.checkoutUrl, requiresConfirm: out.requiresConfirm, providerRef: out.providerRef });
}));

// ---------- payment confirmation ----------
// Single idempotent state machine used by the signed webhook (and the dev mock).
export async function applyPaymentEvent({ type, providerRef }) {
  const tx = await prisma.transaction.findUnique({ where: { providerRef }, include: { backing: { include: { campaign: { include: { game: true } }, reward: true } }, purchase: true } });
  if (!tx) throw httpError(404, 'Unknown transaction');

  if (type === 'payment.succeeded') {
    if (tx.status !== 'PENDING') return tx; // idempotent
    await prisma.$transaction(async (db) => {
      await db.transaction.update({ where: { id: tx.id }, data: { status: 'PAID', paidAt: new Date() } });
      if (tx.backing && !tx.backing.counted) {
        const b = tx.backing;
        await db.backing.update({ where: { id: b.id }, data: { counted: true } });
        await db.campaign.update({ where: { id: b.campaignId }, data: { raisedCents: { increment: b.amountCents }, backersCount: { increment: 1 } } });
        if (b.rewardId) await db.reward.update({ where: { id: b.rewardId }, data: { claimed: { increment: 1 } } });
        if (b.reward && ['GAME_COPY', 'BUNDLE', 'EARLY_ACCESS', 'FOUNDER'].includes(b.reward.kind)) {
          await db.library.upsert({ where: { userId_gameId_source: { userId: b.userId, gameId: b.campaign.gameId, source: 'BACKING' } }, create: { userId: b.userId, gameId: b.campaign.gameId, source: 'BACKING' }, update: { revoked: false } });
        }
      }
      if (tx.purchase && tx.purchase.kind !== 'DLC') {
        await db.library.upsert({ where: { userId_gameId_source: { userId: tx.userId, gameId: tx.purchase.gameId, source: 'PURCHASE' } }, create: { userId: tx.userId, gameId: tx.purchase.gameId, source: 'PURCHASE' }, update: { revoked: false } });
      }
    });
    if (tx.backing) {
      await bump(tx.backing.campaign.gameId, { backers: 1, fundingCents: tx.amountCents });
      computeScore(tx.backing.campaign.gameId).catch(() => {});
    }
    if (tx.purchase) await bump(tx.purchase.gameId, { purchases: 1, salesCents: tx.amountCents });
  } else if (type === 'payment.failed') {
    if (tx.status === 'PENDING') await prisma.transaction.update({ where: { id: tx.id }, data: { status: 'FAILED' } });
  } else if (type === 'payment.chargeback') {
    await prisma.transaction.update({ where: { id: tx.id }, data: { status: 'CHARGEBACK' } });
    await reverseTransaction(tx);
    await secLog('chargeback', { userId: tx.userId, detail: tx.id, severity: 'high' });
    await prisma.user.update({ where: { id: tx.userId }, data: { flagged: true } });
  }
  return prisma.transaction.findUnique({ where: { id: tx.id } });
}

// Undo the entitlements/counters granted by a paid transaction (refund or chargeback).
export async function reverseTransaction(tx) {
  const full = await prisma.transaction.findUnique({ where: { id: tx.id }, include: { backing: { include: { campaign: true, reward: true } }, purchase: true } });
  await prisma.$transaction(async (db) => {
    if (full.backing?.counted) {
      const b = full.backing;
      await db.backing.update({ where: { id: b.id }, data: { counted: false } });
      await db.campaign.update({ where: { id: b.campaignId }, data: { raisedCents: { decrement: b.amountCents }, backersCount: { decrement: 1 } } });
      if (b.rewardId) await db.reward.update({ where: { id: b.rewardId }, data: { claimed: { decrement: 1 } } });
      await db.library.updateMany({ where: { userId: b.userId, gameId: b.campaign.gameId, source: 'BACKING' }, data: { revoked: true } });
    }
    if (full.purchase && full.purchase.kind !== 'DLC') {
      await db.library.updateMany({ where: { userId: full.userId, gameId: full.purchase.gameId, source: 'PURCHASE' }, data: { revoked: true } });
    }
  });
}

r.post('/webhooks/payments', wrap(async (req, res) => {
  if (!verifySignature(req.rawBody ?? '', req.get('x-gamevest-signature'))) {
    await secLog('webhook_bad_signature', { ip: req.ip, severity: 'high' });
    return res.status(401).json({ error: 'Invalid signature' });
  }
  const d = validate(z.object({ type: z.enum(['payment.succeeded', 'payment.failed', 'payment.chargeback']), providerRef: z.string() }), req.body);
  await applyPaymentEvent(d);
  res.json({ received: true });
}));

// Dev-only: simulates the provider calling our webhook after the customer pays.
r.post('/payments/mock/:transactionId/confirm', requireAuth, wrap(async (req, res) => {
  if (config.paymentsProvider !== 'mock' || config.isProd) throw httpError(404, 'Not found');
  const tx = await prisma.transaction.findFirst({ where: { id: req.params.transactionId, userId: req.user.id } });
  if (!tx) throw httpError(404, 'Not found');
  const body = JSON.stringify({ type: req.body?.fail ? 'payment.failed' : 'payment.succeeded', providerRef: tx.providerRef });
  if (!verifySignature(body, signPayload(body))) throw httpError(500, 'signature self-check failed');
  const out = await applyPaymentEvent(JSON.parse(body));
  res.json({ status: out.status });
}));

// ---------- library ----------
r.get('/library', requireAuth, wrap(async (req, res) => {
  const uid = req.user.id;
  const [entries, purchases, backings] = await Promise.all([
    prisma.library.findMany({ where: { userId: uid, revoked: false }, include: { game: { include: { studio: { select: { name: true, slug: true } }, dlcs: true, builds: { orderBy: { createdAt: 'desc' }, take: 1 }, demos: { where: { active: true } } } } }, orderBy: { acquiredAt: 'desc' } }),
    prisma.purchase.findMany({ where: { userId: uid, transaction: { status: 'PAID' } }, include: { game: { select: { title: true, slug: true } }, refunds: { select: { id: true, status: true } }, transaction: { select: { status: true } } }, orderBy: { createdAt: 'desc' } }),
    prisma.backing.findMany({ where: { userId: uid, transaction: { status: 'PAID' } }, include: { campaign: { select: { title: true, game: { select: { title: true, slug: true } } } }, reward: { select: { title: true } }, refunds: { select: { id: true, status: true } } }, orderBy: { createdAt: 'desc' } }),
  ]);
  const ownedDlc = new Set(purchases.filter((p) => p.kind === 'DLC' && !p.refunds.some((x) => ['APPROVED', 'AUTO_APPROVED', 'PAID'].includes(x.status))).map((p) => p.itemTitle));
  const byGame = new Map();
  for (const e of entries) {
    const o = byGame.get(e.gameId) ?? { game: { id: e.game.id, slug: e.game.slug, title: e.game.title, stage: e.game.stage, coverUrl: e.game.coverUrl, coverSeed: e.game.coverSeed, genres: e.game.genres, studio: e.game.studio, latestBuild: e.game.builds[0] ?? null, hasDemo: e.game.demos.length > 0 }, sources: [], dlcs: e.game.dlcs.map((d) => ({ ...d, owned: ownedDlc.has(d.title) })) };
    o.sources.push(e.source);
    byGame.set(e.gameId, o);
  }
  const all = [...byGame.values()];
  res.json({
    owned: all.filter((x) => x.sources.some((s) => s === 'PURCHASE')),
    backed: all.filter((x) => x.sources.includes('BACKING') && !x.sources.includes('PURCHASE')),
    demos: all.filter((x) => x.sources.every((s) => s === 'DEMO')),
    history: [
      ...purchases.map((p) => ({ id: p.id, type: 'PURCHASE', kind: p.kind, title: p.itemTitle, game: p.game, amountCents: p.amountCents, at: p.createdAt, refund: p.refunds[0] ?? null, termsVersion: p.termsVersion })),
      ...backings.map((b) => ({ id: b.id, type: 'BACKING', kind: 'CROWDFUNDING', title: b.reward?.title ?? 'Supporter pledge', game: b.campaign.game, amountCents: b.amountCents, at: b.createdAt, refund: b.refunds[0] ?? null, termsVersion: b.termsVersion, delivery: b.deliveryStatus })),
    ].sort((a, b) => b.at - a.at),
  });
}));

// ---------- refund center ----------
const ACTIVE_REFUND = ['REQUESTED', 'AUTO_APPROVED', 'UNDER_REVIEW', 'APPROVED', 'PAID'];
const STRONG_REASONS = ['NOT_DELIVERED', 'DUPLICATE_CHARGE', 'UNAUTHORIZED', 'MISLEADING'];

export async function executeRefund(refund) {
  const tx = await prisma.transaction.findUnique({ where: { id: refund.transactionId } });
  // provider.refund(tx.providerRef, refund.amountCents) would be called here for real providers
  await reverseTransaction(tx);
  await prisma.transaction.update({ where: { id: tx.id }, data: { status: 'REFUNDED' } });
  await prisma.refund.update({ where: { id: refund.id }, data: { status: 'PAID', decidedAt: new Date() } });
  await notify(refund.userId, 'refund', 'Your refund was processed', `R$ ${(refund.amountCents / 100).toFixed(2)} will be returned to your original payment method.`, '/refunds');
}

r.post('/refunds', requireAuth, wrap(async (req, res) => {
  const d = validate(z.object({ purchaseId: z.string().optional(), backingId: z.string().optional(), reason: z.enum(['NOT_AS_DESCRIBED', 'TECHNICAL', 'NOT_DELIVERED', 'DUPLICATE_CHARGE', 'UNAUTHORIZED', 'MISLEADING', 'CHANGED_MIND', 'OTHER']), details: z.string().trim().max(1000).optional() }).refine((x) => !!x.purchaseId !== !!x.backingId, 'Provide exactly one of purchaseId or backingId'), req.body);
  let scope, item, tx, policyKey;
  if (d.purchaseId) {
    item = await prisma.purchase.findFirst({ where: { id: d.purchaseId, userId: req.user.id }, include: { game: true, transaction: true } });
    if (!item) throw httpError(404, 'Purchase not found');
    scope = { GAME: 'RELEASED_GAME', PRE_ORDER: 'PRE_ORDER', EARLY_ACCESS: 'EARLY_ACCESS', DLC: 'DLC' }[item.kind];
  } else {
    item = await prisma.backing.findFirst({ where: { id: d.backingId, userId: req.user.id }, include: { campaign: true, reward: true, transaction: true } });
    if (!item) throw httpError(404, 'Pledge not found');
    scope = item.reward && item.deliveryStatus === 'DELIVERED' ? 'REWARD' : 'CROWDFUNDING';
  }
  tx = item.transaction;
  if (tx.status !== 'PAID') throw httpError(400, 'Only paid transactions can be refunded');
  const existing = await prisma.refund.findFirst({ where: { transactionId: tx.id, status: { in: ACTIVE_REFUND } } });
  if (existing) throw httpError(409, 'A refund request already exists for this item');

  const policy = (await getPolicies()).find((p) => p.scope === scope);
  const ageDays = (Date.now() - tx.paidAt.getTime()) / 864e5;
  let playMin = 0;
  if (d.purchaseId) playMin = (await prisma.library.findFirst({ where: { userId: req.user.id, gameId: item.gameId, source: 'PURCHASE' } }))?.playtimeMinutes ?? 0;
  const inWindow = policy.refundable && ageDays <= policy.windowDays;
  const withinPlay = policy.maxPlaytimeMinutes == null || playMin <= policy.maxPlaytimeMinutes;
  const strong = STRONG_REASONS.includes(d.reason);

  let status, note;
  if (inWindow && withinPlay && policy.autoApprove) { status = 'AUTO_APPROVED'; note = 'Eligible under the refund policy (automatic review).'; }
  else if ((inWindow && withinPlay) || strong) { status = 'UNDER_REVIEW'; note = strong && !inWindow ? 'Outside the standard window; sent for manual review because of the reason selected.' : 'Sent for manual review by the GameVest team.'; }
  else { status = 'DENIED'; note = !inWindow ? `Outside the ${policy.windowDays}-day refund window for this type of purchase.` : `Playtime exceeds the ${policy.maxPlaytimeMinutes}-minute limit for this type of purchase.`; }

  const refund = await prisma.refund.create({ data: { userId: req.user.id, scope, purchaseId: d.purchaseId, backingId: d.backingId, transactionId: tx.id, reason: d.reason, details: d.details, amountCents: tx.amountCents, status, decisionNote: note, decidedAt: status === 'UNDER_REVIEW' ? null : new Date(), decidedBy: status === 'UNDER_REVIEW' ? null : 'system' } });
  if (status === 'AUTO_APPROVED') await executeRefund(refund);
  res.status(201).json({ refund: await prisma.refund.findUnique({ where: { id: refund.id } }), policy });
}));

r.get('/refunds', requireAuth, wrap(async (req, res) => {
  const refunds = await prisma.refund.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' }, include: { purchase: { select: { itemTitle: true } }, backing: { select: { campaign: { select: { title: true } } } } } });
  res.json({ refunds });
}));

r.post('/disputes', requireAuth, wrap(async (req, res) => {
  const d = validate(z.object({ purchaseId: z.string().optional(), backingId: z.string().optional(), subject: z.string().trim().min(5).max(120), body: z.string().trim().min(20).max(3000) }).refine((x) => x.purchaseId || x.backingId, 'purchaseId or backingId required'), req.body);
  const own = d.purchaseId ? await prisma.purchase.findFirst({ where: { id: d.purchaseId, userId: req.user.id } }) : await prisma.backing.findFirst({ where: { id: d.backingId, userId: req.user.id } });
  if (!own) throw httpError(404, 'Transaction not found');
  res.status(201).json({ dispute: await prisma.dispute.create({ data: { ...d, userId: req.user.id } }) });
}));

export default r;
