// Lightweight antifraud heuristics. Every signal is logged to SecurityLog for admin review;
// high-risk ones flag the account (which removes its influence from ranking/score).
import { prisma } from '../db.js';
import { secLog } from './security.js';

export async function assessPayment(user, amountCents, ip) {
  const hourAgo = new Date(Date.now() - 36e5);
  const recent = await prisma.transaction.count({ where: { userId: user.id, createdAt: { gte: hourAgo } } });
  const ageH = (Date.now() - user.createdAt.getTime()) / 36e5;
  let risk = 0;
  const reasons = [];
  if (recent >= 5) { risk += 2; reasons.push('velocity'); }
  if (ageH < 1 && amountCents >= 20000) { risk += 2; reasons.push('new_account_high_value'); }
  const chargebacks = await prisma.transaction.count({ where: { userId: user.id, status: 'CHARGEBACK' } });
  if (chargebacks > 0) { risk += 3; reasons.push('prior_chargeback'); }
  if (risk >= 3) {
    await secLog('payment_blocked', { userId: user.id, ip, detail: reasons.join(','), severity: 'high' });
    return { allowed: false, reasons };
  }
  if (risk > 0) await secLog('payment_suspicious', { userId: user.id, ip, detail: reasons.join(','), severity: 'warn' });
  return { allowed: true, reasons };
}

// Multiple accounts from one IP posting reviews on the same game
export async function checkReviewAbuse(user, gameId, ip) {
  if (!ip) return;
  const same = await prisma.user.count({ where: { lastIp: ip, reviews: { some: { gameId } } } });
  if (same >= 3) await secLog('review_ring', { userId: user.id, ip, detail: `${same + 1} accounts on one IP reviewing ${gameId}`, severity: 'warn' });
}
