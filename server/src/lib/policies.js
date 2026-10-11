import { prisma } from '../db.js';

export const DEFAULT_POLICIES = [
  { scope: 'RELEASED_GAME', windowDays: 14, maxPlaytimeMinutes: 120, autoApprove: true, refundable: true,
    summary: 'Released games: refund within 14 days of purchase and under 2 hours played. Legal withdrawal rights under applicable consumer law are always preserved.' },
  { scope: 'PRE_ORDER', windowDays: 365, maxPlaytimeMinutes: null, autoApprove: true, refundable: true,
    summary: 'Pre-orders: refundable until the game is released, and for 14 days after release.' },
  { scope: 'EARLY_ACCESS', windowDays: 14, maxPlaytimeMinutes: 120, autoApprove: false, refundable: true,
    summary: 'Early Access: refund within 14 days and under 2 hours played. Reviewed by our team.' },
  { scope: 'CROWDFUNDING', windowDays: 7, maxPlaytimeMinutes: null, autoApprove: false, refundable: true,
    summary: 'Crowdfunding: pledges can be refunded within 7 days (and while the campaign is running, if within the legal withdrawal period). After that, refunds are reviewed case by case, e.g. for non-delivery. A pledge supports a project in development; it is not an investment and carries no financial return.' },
  { scope: 'DLC', windowDays: 14, maxPlaytimeMinutes: null, autoApprove: false, refundable: true,
    summary: 'DLC: refundable within 14 days when the content has not been consumed.' },
  { scope: 'REWARD', windowDays: 7, maxPlaytimeMinutes: null, autoApprove: false, refundable: true,
    summary: 'Digital rewards: refundable within 7 days if not yet delivered; delivered rewards are reviewed case by case.' },
];

export async function ensurePolicies() {
  for (const p of DEFAULT_POLICIES) {
    await prisma.refundPolicy.upsert({ where: { scope: p.scope }, create: p, update: {} });
  }
}
export const getPolicies = async () => { await ensurePolicies(); return prisma.refundPolicy.findMany(); };
