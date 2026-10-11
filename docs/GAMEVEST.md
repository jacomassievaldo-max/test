# GameVest — MVP

**Discover. Play. Back the next big game.** Monorepo: `client/` (React + Vite + Tailwind + React Router + Axios) and `server/` (Node + Express + Prisma + PostgreSQL).

## Run locally
```bash
# 1. PostgreSQL with a `gamevest` DB/user (see server/.env.example)
cd server && cp .env.example .env && npm i
npx prisma db push && npm run db:seed     # demo data; every account uses password Gamevest123
npm run dev                                # API on :4000
cd ../client && npm i && npm run dev       # app on :5173 (proxies /api, /uploads, /demos)
cd ../server && npm test                   # integration tests (needs seeded DB)
```
Demo accounts: `player1@`, `moonlight@` (verified developer), `novalantern@` (unverified developer), `publisher@`, `admin@` — all `@gamevest.test`.

## What is in the MVP (all 26 items of the brief)
Auth · Home (9 sections) · Discover/Store/Demos/Funding with full filters · Game page · Developer profile & reputation · Submit game · media/trailer/demo upload · Wishlist/Follow/Reviews/Comments · GameVest Score V1 · weekly Trending · Developer dashboard (charts, funnel, retention, anonymous feedback) · Campaigns, rewards, milestones, backing · Protection · Verification · Reports · Admin · Store, purchase, Library · Refund Center with admin-configurable policies · Scout (publisher) V0 · Trust page · responsive + mobile bottom nav.

## Architecture notes
- **Auth**: HttpOnly session cookie (JWT w/ expiry + `tokenVersion` revocation), bcrypt(12), double-submit CSRF token, role guards, rate limits, helmet, zod validation on every write.
- **Money**: integer cents; every pledge/purchase stores user, item, amount, payment, terms version + acceptance time, delivery, refund, dispute. A single idempotent state machine (`applyPaymentEvent`) handles an **HMAC-signed webhook**; the `mock` provider simulates a hosted checkout. Card data never touches GameVest — plug Stripe/Mercado Pago/Pagar.me in `server/src/lib/payments.js`.
- **Uploads**: type allow-list + magic-byte check, random names, `nosniff`; HTML demos are served with a sandbox CSP and embedded in an iframe **without** `allow-same-origin`. `uploads/` is local disk — swap for S3/R2 + CDN.
- **Score / Trending**: `lib/score.js`, `lib/trending.js`. Unique users only, flagged accounts ignored, <24h accounts weighted 25%, log-saturated signals, anomaly detection logged to `SecurityLog`.
- **Antifraud**: payment velocity / new-account / chargeback heuristics, review-ring detection, report clustering, chargeback → flag + revoke entitlements. Admin actions are audited.
- **Compliance wording**: no "guaranteed", "escrow" or return promises anywhere; crowdfunding is rewards-based; risk notices on in-development games; Guarantee and milestone-linked payouts are only described as future/not-yet-offered.

## Deliberately not built yet
Launcher, cloud saves, achievements, chat, financial milestones/escrow, investment modalities, real payment provider, object storage/CDN, queues/email (hourly in-process job is a stand-in), image-similarity/stolen-content detection, DB migrations (uses `prisma db push`; run `prisma migrate dev` before production), CSP for the SPA, automated campaign end/settlement job.
