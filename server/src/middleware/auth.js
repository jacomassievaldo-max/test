import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { prisma } from '../db.js';

const cookieBase = { httpOnly: true, secure: config.isProd, sameSite: config.isProd ? 'strict' : 'lax', path: '/' };

export function issueSession(res, user) {
  const token = jwt.sign({ sub: user.id, v: user.tokenVersion }, config.jwtSecret, { expiresIn: config.sessionTtlSec });
  res.cookie('gv_session', token, { ...cookieBase, maxAge: config.sessionTtlSec * 1000 });
  // Double-submit CSRF token: readable by JS, must be echoed in X-CSRF-Token.
  const csrf = crypto.randomBytes(24).toString('hex');
  res.cookie('gv_csrf', csrf, { ...cookieBase, httpOnly: false, maxAge: config.sessionTtlSec * 1000 });
  return csrf;
}

export function clearSession(res) {
  res.clearCookie('gv_session', cookieBase);
  res.clearCookie('gv_csrf', { ...cookieBase, httpOnly: false });
}

export async function loadUser(req, _res, next) {
  const token = req.cookies?.gv_session;
  if (!token) return next();
  try {
    const p = jwt.verify(token, config.jwtSecret);
    const user = await prisma.user.findUnique({
      where: { id: p.sub },
      include: { developer: { include: { studio: true } }, publisher: true, player: true },
    });
    if (user && user.status === 'ACTIVE' && user.tokenVersion === p.v) req.user = user;
  } catch { /* invalid/expired token => anonymous */ }
  next();
}

export function csrfProtect(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.path.startsWith('/webhooks/')) return next(); // authenticated by signature
  if (!req.cookies?.gv_session) return next(); // no session => nothing to forge
  const header = req.get('x-csrf-token');
  const cookie = req.cookies?.gv_csrf;
  if (!header || !cookie || header.length !== cookie.length ||
      !crypto.timingSafeEqual(Buffer.from(header), Buffer.from(cookie))) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }
  next();
}

export const requireAuth = (req, res, next) =>
  req.user ? next() : res.status(401).json({ error: 'Authentication required' });

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
  next();
};

export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
