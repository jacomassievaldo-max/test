import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/db.js';
import { computeTrending } from '../src/lib/trending.js';
import { settleCampaigns } from '../src/lib/jobs.js';

test.after(() => prisma.$disconnect());

test('burst of brand-new accounts is flagged and heavily down-weighted in trending', async () => {
  const game = await prisma.game.findUnique({ where: { slug: 'lantern-keeper' } });
  const before = (await computeTrending()).find((r) => r.gameId === game.id);
  const users = [];
  for (let i = 0; i < 14; i++) users.push(await prisma.user.create({ data: { email: `sock${Date.now()}_${i}@x.test`, name: 'Sock', passwordHash: 'x' } }));
  try {
    await prisma.wishlist.createMany({ data: users.map((u) => ({ userId: u.id, gameId: game.id })) });
    const after = (await computeTrending()).find((r) => r.gameId === game.id);
    // 14 fresh signals at 25% weight, then x0.4 anomaly damping: far less than 14 genuine wishlists would add
    const genuine = 3 * Math.log1p(14);
    assert.ok(after.points - before.points < genuine * 0.4, `gain ${after.points - before.points} should be << ${genuine}`);
    const log = await prisma.securityLog.findFirst({ where: { type: 'ranking_anomaly', detail: { contains: 'lantern-keeper' } }, orderBy: { createdAt: 'desc' } });
    assert.ok(log);
  } finally {
    await prisma.wishlist.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
    await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
    await computeTrending();
  }
});

test('expired campaigns are settled as ENDED or FUNDED', async () => {
  const game = await prisma.game.findUnique({ where: { slug: 'dark-horizon' } });
  const mk = (raised) => prisma.campaign.create({ data: { gameId: game.id, title: 'tmp', goalCents: 100000, raisedCents: raised, endsAt: new Date(Date.now() - 1000), status: 'ACTIVE', adminApproved: true } });
  const [a, b] = [await mk(0), await mk(100000)];
  try {
    await settleCampaigns();
    assert.equal((await prisma.campaign.findUnique({ where: { id: a.id } })).status, 'ENDED');
    assert.equal((await prisma.campaign.findUnique({ where: { id: b.id } })).status, 'FUNDED');
  } finally { await prisma.campaign.deleteMany({ where: { id: { in: [a.id, b.id] } } }); }
});
