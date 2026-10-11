import { prisma } from '../db.js';

export async function secLog(type, { userId, ip, detail, severity = 'info' } = {}) {
  try {
    await prisma.securityLog.create({ data: { type, userId, ip, detail: detail?.slice(0, 500), severity } });
  } catch { /* logging must never break a request */ }
}

export async function audit(adminId, action, targetType, targetId, note) {
  await prisma.adminAction.create({ data: { adminId, action, targetType, targetId, note } });
}

export async function notify(userId, type, title, body, link) {
  await prisma.notification.create({ data: { userId, type, title, body, link } });
}
