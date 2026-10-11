import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { wrap, requireRole } from '../middleware/auth.js';
import { validate, httpError } from '../lib/util.js';
import { audit, notify } from '../lib/security.js';
import { recomputeAllScores, computeScore } from '../lib/score.js';
import { computeTrending } from '../lib/trending.js';
import { computeReputation } from '../lib/reputation.js';
import { executeRefund } from './commerce.js';
import { DEFAULT_POLICIES } from '../lib/policies.js';
import { settleCampaigns } from '../lib/jobs.js';

const r = Router();
r.use(requireRole('ADMIN'));
const note = z.object({ note: z.string().trim().max(1000).optional() });
const memberOf = async (studioId) => (await prisma.developerProfile.findFirst({ where: { studioId } }))?.userId;

r.get('/stats', wrap(async (_req, res) => {
  const [users, games, pending, campaigns, openReports, txs, refunds, verifs, disputes] = await Promise.all([
    prisma.user.count(), prisma.game.count({ where: { status: 'PUBLISHED' } }), prisma.game.count({ where: { status: 'PENDING' } }),
    prisma.campaign.count({ where: { status: 'ACTIVE' } }), prisma.report.count({ where: { status: { in: ['OPEN', 'REVIEWING'] } } }),
    prisma.transaction.aggregate({ where: { status: 'PAID' }, _sum: { amountCents: true }, _count: true }),
    prisma.refund.count({ where: { status: 'UNDER_REVIEW' } }), prisma.verification.count({ where: { status: 'PENDING' } }),
    prisma.dispute.count({ where: { status: 'OPEN' } }),
  ]);
  const purchases = await prisma.purchase.aggregate({ where: { transaction: { status: 'PAID' } }, _sum: { commissionCents: true } });
  const raised = await prisma.campaign.aggregate({ _sum: { raisedCents: true } });
  res.json({ users, games, pendingGames: pending, activeCampaigns: campaigns, openReports, paidTransactions: txs._count, volumeCents: txs._sum.amountCents ?? 0, refundsToReview: refunds, pendingVerifications: verifs, openDisputes: disputes, commissionCents: (purchases._sum.commissionCents ?? 0) + Math.round(((raised._sum.raisedCents ?? 0) * 800) / 10000) });
}));

// ---- games ----
r.get('/games', wrap(async (req, res) => {
  const status = req.query.status ? String(req.query.status) : undefined;
  res.json({ games: await prisma.game.findMany({ where: status ? { status } : {}, include: { studio: { include: { verification: true } }, score: true, _count: { select: { reports: true } } }, orderBy: { createdAt: 'desc' }, take: 100 }) });
}));
r.post('/games/:id/:action', wrap(async (req, res) => {
  const { note: n } = validate(note, req.body);
  const g = await prisma.game.findUnique({ where: { id: req.params.id } });
  if (!g) throw httpError(404, 'Game not found');
  const a = req.params.action;
  const map = {
    approve: { status: 'PUBLISHED', rejectionNote: null }, reject: { status: 'REJECTED', rejectionNote: n || 'Rejected by moderation' },
    suspend: { status: 'SUSPENDED' }, restore: { status: 'PUBLISHED' },
    feature: { featured: true }, unfeature: { featured: false },
    protect: { protectedBy: true }, unprotect: { protectedBy: false },
    sponsor: { sponsored: true }, unsponsor: { sponsored: false },
  };
  if (!map[a]) throw httpError(400, 'Unknown action');
  if (a === 'protect' && !(await prisma.verification.findFirst({ where: { studioId: g.studioId, status: 'APPROVED' } }))) throw httpError(400, 'Only verified studios can receive GameVest Protection');
  await prisma.game.update({ where: { id: g.id }, data: map[a] });
  await audit(req.user.id, `game.${a}`, 'Game', g.id, n);
  const owner = await memberOf(g.studioId);
  if (owner && ['approve', 'reject', 'suspend'].includes(a)) await notify(owner, 'moderation', `${g.title}: ${a === 'approve' ? 'approved and published' : a === 'reject' ? 'needs changes' : 'suspended'}`, n, '/developer');
  if (a === 'approve') computeScore(g.id).catch(() => {});
  res.json({ ok: true });
}));

// ---- users ----
r.get('/users', wrap(async (req, res) => {
  const q = req.query.q ? String(req.query.q) : null;
  res.json({ users: await prisma.user.findMany({ where: q ? { OR: [{ email: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }] } : {}, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, email: true, name: true, role: true, status: true, flagged: true, createdAt: true } }) });
}));
r.post('/users/:id/:action', wrap(async (req, res) => {
  const { note: n } = validate(note, req.body);
  const u = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!u) throw httpError(404, 'User not found');
  if (u.role === 'ADMIN') throw httpError(403, 'Admins cannot be modified here');
  const map = { suspend: { status: 'SUSPENDED', tokenVersion: { increment: 1 } }, reinstate: { status: 'ACTIVE' }, flag: { flagged: true }, unflag: { flagged: false } };
  if (!map[req.params.action]) throw httpError(400, 'Unknown action');
  await prisma.user.update({ where: { id: u.id }, data: map[req.params.action] });
  await audit(req.user.id, `user.${req.params.action}`, 'User', u.id, n);
  res.json({ ok: true });
}));

// ---- campaigns ----
r.get('/campaigns', wrap(async (_req, res) => {
  res.json({ campaigns: await prisma.campaign.findMany({ include: { game: { select: { title: true, slug: true, status: true, studio: { select: { name: true, verification: { select: { status: true } } } } } } }, orderBy: { createdAt: 'desc' }, take: 100 }) });
}));
r.post('/campaigns/:id/:action', wrap(async (req, res) => {
  const { note: n } = validate(note, req.body);
  const c = await prisma.campaign.findUnique({ where: { id: req.params.id }, include: { game: { include: { studio: { include: { verification: true } } } } } });
  if (!c) throw httpError(404, 'Campaign not found');
  const a = req.params.action;
  if (a === 'approve') {
    if (c.game.studio.verification?.status !== 'APPROVED') throw httpError(400, 'Studio is not verified');
    if (c.game.status !== 'PUBLISHED') throw httpError(400, 'Game is not published');
    await prisma.campaign.update({ where: { id: c.id }, data: { status: 'ACTIVE', adminApproved: true, endsAt: new Date(Math.max(Date.now() + 7 * 864e5, c.endsAt.getTime())) } });
  } else if (a === 'cancel') await prisma.campaign.update({ where: { id: c.id }, data: { status: 'CANCELLED' } });
  else if (a === 'end') await prisma.campaign.update({ where: { id: c.id }, data: { status: c.raisedCents >= c.goalCents ? 'FUNDED' : 'ENDED' } });
  else throw httpError(400, 'Unknown action');
  await audit(req.user.id, `campaign.${a}`, 'Campaign', c.id, n);
  const owner = await memberOf(c.game.studioId);
  if (owner) await notify(owner, 'campaign', `Campaign ${a === 'approve' ? 'approved and live' : a === 'cancel' ? 'cancelled' : 'closed'}: ${c.title}`, n, '/developer');
  res.json({ ok: true });
}));

// ---- verification ----
r.get('/verifications', wrap(async (_req, res) => res.json({ verifications: await prisma.verification.findMany({ include: { studio: true }, orderBy: { submittedAt: 'desc' } }) })));
r.post('/verifications/:id/:action', wrap(async (req, res) => {
  const { note: n } = validate(note, req.body);
  const v = await prisma.verification.findUnique({ where: { id: req.params.id } });
  if (!v) throw httpError(404, 'Not found');
  if (!['approve', 'reject'].includes(req.params.action)) throw httpError(400, 'Unknown action');
  const status = req.params.action === 'approve' ? 'APPROVED' : 'REJECTED';
  await prisma.verification.update({ where: { id: v.id }, data: { status, notes: n, reviewedBy: req.user.id, reviewedAt: new Date() } });
  await audit(req.user.id, `verification.${req.params.action}`, 'Verification', v.id, n);
  computeReputation(v.studioId).catch(() => {});
  const owner = await memberOf(v.studioId);
  if (owner) await notify(owner, 'verification', status === 'APPROVED' ? 'Your studio is now GameVest Verified' : 'Verification needs attention', n, '/developer');
  res.json({ ok: true });
}));

// ---- reports ----
r.get('/reports', wrap(async (req, res) => {
  const status = req.query.status ? String(req.query.status) : undefined;
  res.json({ reports: await prisma.report.findMany({ where: status ? { status } : {}, include: { game: { select: { title: true, slug: true } }, studio: { select: { name: true } }, reporter: { select: { email: true } } }, orderBy: { createdAt: 'desc' }, take: 100 }) });
}));
r.post('/reports/:id/:action', wrap(async (req, res) => {
  const { note: n } = validate(note, req.body);
  const map = { review: 'REVIEWING', action: 'ACTIONED', dismiss: 'DISMISSED' };
  if (!map[req.params.action]) throw httpError(400, 'Unknown action');
  const rep = await prisma.report.update({ where: { id: req.params.id }, data: { status: map[req.params.action] } });
  await audit(req.user.id, `report.${req.params.action}`, 'Report', rep.id, n);
  if (rep.studioId) computeReputation(rep.studioId).catch(() => {});
  res.json({ ok: true });
}));

// ---- money ----
r.get('/transactions', wrap(async (_req, res) => res.json({ transactions: await prisma.transaction.findMany({ orderBy: { createdAt: 'desc' }, take: 100, include: { user: { select: { email: true } }, backing: { select: { campaign: { select: { title: true } } } }, purchase: { select: { itemTitle: true } } } }) })));
r.get('/refunds', wrap(async (_req, res) => res.json({ refunds: await prisma.refund.findMany({ orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take: 100, include: { user: { select: { email: true } }, purchase: { select: { itemTitle: true } }, backing: { select: { campaign: { select: { title: true } } } } } }) })));
r.post('/refunds/:id/:action', wrap(async (req, res) => {
  const { note: n } = validate(note, req.body);
  const rf = await prisma.refund.findUnique({ where: { id: req.params.id } });
  if (!rf) throw httpError(404, 'Not found');
  if (!['UNDER_REVIEW', 'REQUESTED', 'DENIED'].includes(rf.status)) throw httpError(400, 'Refund already decided');
  if (req.params.action === 'approve') {
    await prisma.refund.update({ where: { id: rf.id }, data: { status: 'APPROVED', decisionNote: n || 'Approved by GameVest', decidedBy: req.user.id } });
    await executeRefund(rf);
  } else if (req.params.action === 'deny') {
    await prisma.refund.update({ where: { id: rf.id }, data: { status: 'DENIED', decisionNote: n || 'Denied after review', decidedBy: req.user.id, decidedAt: new Date() } });
    await notify(rf.userId, 'refund', 'Your refund request was reviewed', n || 'Denied after review', '/refunds');
  } else throw httpError(400, 'Unknown action');
  await audit(req.user.id, `refund.${req.params.action}`, 'Refund', rf.id, n);
  res.json({ ok: true });
}));
r.get('/disputes', wrap(async (_req, res) => res.json({ disputes: await prisma.dispute.findMany({ orderBy: { createdAt: 'desc' }, take: 100, include: { user: { select: { email: true } } } }) })));
r.post('/disputes/:id/:action', wrap(async (req, res) => {
  const map = { resolve_user: 'RESOLVED_USER', resolve_dev: 'RESOLVED_DEV', close: 'CLOSED' };
  if (!map[req.params.action]) throw httpError(400, 'Unknown action');
  await prisma.dispute.update({ where: { id: req.params.id }, data: { status: map[req.params.action] } });
  await audit(req.user.id, `dispute.${req.params.action}`, 'Dispute', req.params.id);
  res.json({ ok: true });
}));
r.put('/refund-policies/:scope', wrap(async (req, res) => {
  const d = validate(z.object({ windowDays: z.number().int().min(0).max(730), maxPlaytimeMinutes: z.number().int().min(0).nullable(), autoApprove: z.boolean(), refundable: z.boolean(), summary: z.string().min(10).max(600) }), req.body);
  if (!DEFAULT_POLICIES.some((p) => p.scope === req.params.scope)) throw httpError(404, 'Unknown scope');
  await prisma.refundPolicy.update({ where: { scope: req.params.scope }, data: d });
  await audit(req.user.id, 'policy.update', 'RefundPolicy', req.params.scope, JSON.stringify(d));
  res.json({ ok: true });
}));

// ---- logs & jobs ----
r.get('/security-logs', wrap(async (_req, res) => res.json({ logs: await prisma.securityLog.findMany({ orderBy: { createdAt: 'desc' }, take: 150 }) })));
r.get('/audit', wrap(async (_req, res) => res.json({ actions: await prisma.adminAction.findMany({ orderBy: { createdAt: 'desc' }, take: 150 }) })));
r.post('/jobs/recompute', wrap(async (req, res) => {
  await settleCampaigns(); await recomputeAllScores(); const t = await computeTrending();
  const studios = await prisma.studio.findMany({ select: { id: true } });
  for (const s of studios) await computeReputation(s.id);
  await audit(req.user.id, 'jobs.recompute', 'System', 'scores+trending');
  res.json({ ranked: t.length });
}));

export default r;
