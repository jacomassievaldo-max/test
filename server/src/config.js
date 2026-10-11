import 'dotenv/config';

const isProd = process.env.NODE_ENV === 'production';
const secret = process.env.JWT_SECRET;
if (isProd && (!secret || secret.length < 32)) throw new Error('JWT_SECRET (>=32 chars) is required in production');

export const config = {
  isProd,
  port: Number(process.env.PORT || 4000),
  jwtSecret: secret || 'dev-insecure-secret-do-not-use-in-production',
  webhookSecret: process.env.WEBHOOK_SECRET || 'dev-webhook-secret',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  paymentsProvider: process.env.PAYMENTS_PROVIDER || 'mock',
  sessionTtlSec: 60 * 60 * 24 * 7,
  termsVersion: '2026-01',
  platformFeeBps: { sales: 1500, crowdfunding: 800 }, // 15% sales, 8% campaigns
  uploadMaxBytes: 8 * 1024 * 1024,
};
