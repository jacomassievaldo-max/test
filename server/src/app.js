import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { config } from './config.js';
import { loadUser, csrfProtect, requireRole } from './middleware/auth.js';
import auth from './routes/auth.js';
import publicRoutes from './routes/public.js';
import engagement from './routes/engagement.js';
import developer from './routes/developer.js';
import commerce from './routes/commerce.js';
import admin from './routes/admin.js';
import scout from './routes/scout.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: config.clientOrigin, credentials: true }));
  app.use(express.json({ limit: '200kb', verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); } }));
  app.use(cookieParser());
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }));

  // Uploads: never sniffed, and HTML demos are sandboxed (no same-origin access) even if opened directly.
  app.use('/uploads', express.static(path.resolve('uploads'), {
    setHeaders: (res, file) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (file.endsWith('.html')) res.setHeader('Content-Security-Policy', "sandbox allow-scripts allow-pointer-lock; default-src 'self' 'unsafe-inline' data: blob:");
    },
  }));
  app.use('/demos', express.static(path.resolve('public/demos'), {
    setHeaders: (res) => { res.setHeader('Content-Security-Policy', "sandbox allow-scripts allow-pointer-lock; default-src 'self' 'unsafe-inline' data: blob:"); },
  }));

  app.use('/api', loadUser, csrfProtect);
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', auth);
  app.use('/api', publicRoutes);
  app.use('/api', engagement);
  app.use('/api', commerce);
  app.use('/api/dev', developer);
  app.use('/api/admin', admin);
  app.use('/api/scout', scout);

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err.status || (err.name === 'MulterError' ? 400 : 500);
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message });
  });
  return app;
}
