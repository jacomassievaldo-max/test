import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../db.js';
import { issueSession, clearSession, wrap, requireAuth } from '../middleware/auth.js';
import { validate, httpError, slugify } from '../lib/util.js';
import { secLog } from '../lib/security.js';

const r = Router();
const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts. Try again later.' } });

const publicUser = (u) => ({
  id: u.id, email: u.email, name: u.name, role: u.role,
  studio: u.developer?.studio ? { id: u.developer.studio.id, name: u.developer.studio.name, slug: u.developer.studio.slug } : null,
  company: u.publisher?.company ?? null,
});

const registerSchema = z.object({
  email: z.string().email().max(200).transform((s) => s.toLowerCase()),
  password: z.string().min(8).max(128).refine((p) => /[a-zA-Z]/.test(p) && /\d/.test(p), 'must contain letters and numbers'),
  name: z.string().trim().min(2).max(60),
  role: z.enum(['PLAYER', 'DEVELOPER', 'PUBLISHER']).default('PLAYER'),
  studioName: z.string().trim().min(2).max(60).optional(),
  country: z.string().trim().max(60).optional(),
  company: z.string().trim().min(2).max(80).optional(),
});

r.post('/register', authLimiter, wrap(async (req, res) => {
  const d = validate(registerSchema, req.body);
  if (d.role === 'DEVELOPER' && !d.studioName) throw httpError(400, 'studioName is required for developers');
  if (d.role === 'PUBLISHER' && !d.company) throw httpError(400, 'company is required for publishers');
  if (await prisma.user.findUnique({ where: { email: d.email } })) throw httpError(409, 'Email already registered');
  const passwordHash = await bcrypt.hash(d.password, 12);
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({ data: { email: d.email, name: d.name, role: d.role, passwordHash, lastIp: req.ip } });
    if (d.role === 'PLAYER') await tx.playerProfile.create({ data: { userId: u.id, displayName: d.name, country: d.country } });
    if (d.role === 'DEVELOPER') {
      let slug = slugify(d.studioName);
      if (await tx.studio.findUnique({ where: { slug } })) slug += '-' + Math.random().toString(36).slice(2, 6);
      const studio = await tx.studio.create({ data: { name: d.studioName, slug, country: d.country } });
      await tx.developerProfile.create({ data: { userId: u.id, studioId: studio.id } });
    }
    if (d.role === 'PUBLISHER') await tx.publisherProfile.create({ data: { userId: u.id, company: d.company } });
    return tx.user.findUnique({ where: { id: u.id }, include: { developer: { include: { studio: true } }, publisher: true } });
  });
  const csrf = issueSession(res, user);
  res.status(201).json({ user: publicUser(user), csrf });
}));

r.post('/login', authLimiter, wrap(async (req, res) => {
  const d = validate(z.object({ email: z.string().email().transform((s) => s.toLowerCase()), password: z.string().min(1).max(128) }), req.body);
  const user = await prisma.user.findUnique({ where: { email: d.email }, include: { developer: { include: { studio: true } }, publisher: true } });
  // constant-ish time: always run a compare
  const ok = await bcrypt.compare(d.password, user?.passwordHash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi');
  if (!user || !ok) { await secLog('login_failed', { ip: req.ip, detail: d.email, severity: 'warn' }); throw httpError(401, 'Invalid email or password'); }
  if (user.status !== 'ACTIVE') throw httpError(403, 'This account is suspended');
  await prisma.user.update({ where: { id: user.id }, data: { lastIp: req.ip } });
  const csrf = issueSession(res, user);
  res.json({ user: publicUser(user), csrf });
}));

r.post('/logout', wrap(async (req, res) => { clearSession(res); res.json({ ok: true }); }));

r.get('/me', wrap(async (req, res) => {
  if (!req.user) return res.json({ user: null });
  res.json({ user: publicUser(req.user), csrf: req.cookies.gv_csrf });
}));

// "Log out everywhere": bumps tokenVersion so every issued token becomes invalid.
r.post('/logout-all', requireAuth, wrap(async (req, res) => {
  await prisma.user.update({ where: { id: req.user.id }, data: { tokenVersion: { increment: 1 } } });
  clearSession(res);
  res.json({ ok: true });
}));

export default r;
