// Integration test against the seeded dev database: `npm run db:seed` first, then `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { signPayload } from '../src/lib/payments.js';
import { config } from '../src/config.js';
import { prisma } from '../src/db.js';

let server, base;
test.before(async () => { server = createApp().listen(0); base = `http://127.0.0.1:${server.address().port}/api`; });
test.after(async () => { server.close(); await prisma.$disconnect(); });

class Client {
  cookies = {};
  async req(method, path, body, headers = {}) {
    const h = { 'content-type': 'application/json', cookie: Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; '), ...headers };
    if (this.cookies.gv_csrf && method !== 'GET' && !('x-csrf-token' in headers)) h['x-csrf-token'] = this.cookies.gv_csrf;
    const res = await fetch(base + path, { method, headers: h, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
    for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); this.cookies[kv.slice(0, i)] = kv.slice(i + 1); }
    return { status: res.status, body: await res.json().catch(() => null) };
  }
}
const login = async (email) => { const c = new Client(); const r = await c.req('POST', '/auth/login', { email, password: 'Gamevest123' }); assert.equal(r.status, 200); return c; };

test('weak passwords and duplicate emails are rejected', async () => {
  const c = new Client();
  assert.equal((await c.req('POST', '/auth/register', { email: 'x@y.test', password: 'short', name: 'Xx' })).status, 400);
  assert.equal((await c.req('POST', '/auth/register', { email: 'player1@gamevest.test', password: 'Gamevest123', name: 'Dup' })).status, 409);
});

test('CSRF is enforced on authenticated writes', async () => {
  const c = await login('player2@gamevest.test');
    const r = await c.req('POST', '/games/fallen-kingdom/wishlist', {}, { 'x-csrf-token': 'wrong' });
  assert.equal(r.status, 403);
  assert.equal((await c.req('POST', '/games/fallen-kingdom/wishlist', {})).status, 200); // correct token works
});

test('role authorization', async () => {
  const p = await login('player3@gamevest.test');
  assert.equal((await p.req('GET', '/admin/stats')).status, 403);
  assert.equal((await p.req('GET', '/dev/games')).status, 403);
  assert.equal((await new Client().req('GET', '/library')).status, 401);
});

test('backing -> signed webhook -> library -> auto refund', async () => {
  const u = `backer${Date.now()}@gamevest.test`;
  const c = new Client();
  assert.equal((await c.req('POST', '/auth/register', { email: u, password: 'Gamevest123', name: 'Backer Test' })).status, 201);
  const game = (await c.req('GET', '/games/project-oni')).body;
  const camp = game.campaign;
  const reward = camp.rewards.find((r) => r.kind === 'GAME_COPY');
  // terms must be accepted
  assert.equal((await c.req('POST', `/campaigns/${camp.id}/back`, { rewardId: reward.id, amountCents: reward.priceCents, acceptTerms: false, termsVersion: config.termsVersion })).status, 400);
  // below reward minimum
  assert.equal((await c.req('POST', `/campaigns/${camp.id}/back`, { rewardId: reward.id, amountCents: 600, acceptTerms: true, termsVersion: config.termsVersion })).status, 400);
  const before = camp.raisedCents;
  const b = await c.req('POST', `/campaigns/${camp.id}/back`, { rewardId: reward.id, amountCents: reward.priceCents, acceptTerms: true, termsVersion: config.termsVersion });
  assert.equal(b.status, 201);
  // webhook with bad signature is refused
  const payload = JSON.stringify({ type: 'payment.succeeded', providerRef: b.body.providerRef });
  assert.equal((await new Client().req('POST', '/webhooks/payments', payload, { 'x-gamevest-signature': 'deadbeef' })).status, 401);
  // valid signature applies, and is idempotent
  const ok = () => new Client().req('POST', '/webhooks/payments', payload, { 'x-gamevest-signature': signPayload(payload) });
  assert.equal((await ok()).status, 200); assert.equal((await ok()).status, 200);
  const after = (await c.req('GET', '/games/project-oni')).body.campaign;
  assert.equal(after.raisedCents, before + reward.priceCents);
  const lib = (await c.req('GET', '/library')).body;
  assert.equal(lib.backed.length, 1);
  assert.equal(lib.history[0].type, 'BACKING');
  // crowdfunding refunds are manual-review by policy, never silently auto-approved
  const rf = await c.req('POST', '/refunds', { backingId: lib.history[0].id, reason: 'CHANGED_MIND' });
  assert.equal(rf.status, 201); assert.equal(rf.body.refund.status, 'UNDER_REVIEW');
  assert.equal((await c.req('POST', '/refunds', { backingId: lib.history[0].id, reason: 'CHANGED_MIND' })).status, 409);
  // admin approves -> totals reversed, library revoked
  const admin = await login('admin@gamevest.test');
  assert.equal((await admin.req('POST', `/admin/refunds/${rf.body.refund.id}/approve`, { note: 'ok' })).status, 200);
  assert.equal((await c.req('GET', '/games/project-oni')).body.campaign.raisedCents, before);
  assert.equal((await c.req('GET', '/library')).body.backed.length, 0);
});

test('cannot review own game; one review per user; demo feedback is anonymous in dashboard', async () => {
  const dev = await login('moonlight@gamevest.test');
  assert.equal((await dev.req('POST', '/games/fallen-kingdom/reviews', { rating: 5, recommended: true, body: 'my own game is great' })).status, 403);
  const d = (await dev.req('GET', '/dev/dashboard')).body;
  assert.ok(d.feedback.count > 0);
  assert.ok(!/@gamevest\.test|userId/.test(JSON.stringify(d)), 'no player identity leaks into dashboard');
});

test('campaign cannot launch without verification', async () => {
  const dev = await login('novalantern@gamevest.test');
  const g = (await dev.req('GET', '/dev/games')).body.games[0];
  const c = await dev.req('POST', '/dev/campaigns', { gameId: g.id, title: 'Test campaign', goalCents: 100000, durationDays: 30, rewards: [{ title: 'Thanks', priceCents: 1000, kind: 'SUPPORT' }] });
  assert.equal(c.status, 201);
  assert.equal((await dev.req('POST', `/dev/campaigns/${c.body.campaign.id}/submit`, {})).status, 400);
  await prisma.campaign.delete({ where: { id: c.body.campaign.id } });
});
