import { prisma } from '../db.js';
import { notify } from './security.js';
import { computeScore, recomputeAllScores } from './score.js';
import { computeTrending } from './trending.js';

// Close campaigns whose deadline has passed: FUNDED if the goal was met, otherwise ENDED.
// Backers of unfunded campaigns are told how to request a refund (policy still decides).
export async function settleCampaigns(now = new Date()) {
  const due = await prisma.campaign.findMany({ where: { status: 'ACTIVE', endsAt: { lte: now } }, include: { game: { include: { studio: { include: { members: true } } } } } });
  for (const c of due) {
    const funded = c.raisedCents >= c.goalCents;
    await prisma.campaign.update({ where: { id: c.id }, data: { status: funded ? 'FUNDED' : 'ENDED' } });
    for (const m of c.game.studio.members) await notify(m.userId, 'campaign', `Campaign ${funded ? 'funded' : 'ended'}: ${c.title}`, funded ? 'Goal reached. Keep backers updated on milestones.' : 'The goal was not reached.', '/developer');
    if (!funded) {
      const backers = await prisma.backing.findMany({ where: { campaignId: c.id, counted: true }, select: { userId: true } });
      for (const b of backers) await notify(b.userId, 'campaign', `${c.title} did not reach its goal`, 'You can request a refund from the Refund Center.', '/refunds');
    }
    computeScore(c.gameId).catch(() => {});
  }
  return due.length;
}

export async function runHourly() {
  await settleCampaigns();
  await recomputeAllScores();
  await computeTrending();
}
