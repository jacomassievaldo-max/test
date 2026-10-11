import { prisma } from '../db.js';
import { todayDate } from './util.js';

// Increment daily counters for a game. fields: { visitors: 1, wishlists: -1, ... }
export async function bump(gameId, fields) {
  const date = todayDate();
  const inc = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { increment: v }]));
  await prisma.gameAnalytics.upsert({
    where: { gameId_date: { gameId, date } },
    create: { gameId, date, ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, Math.max(0, v)])) },
    update: inc,
  });
}
