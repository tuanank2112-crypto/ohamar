// SPDX-License-Identifier: AGPL-3.0-or-later
import { prisma } from '../../shared/database/prisma-client.js';
import { runSystemQuery } from '../../shared/tenant/tenant-context.js';

const SUSPENSION_PATTERNS = /(challenge|verify account|account.*locked|tài khoản.*khóa|checkpoint|kicked|kickout|banned|temporarily blocked)/i;
const SAFETY_CACHE_TTL_MS = 60_000;
const safetyCache = new Map<string, { expiresAt: number; value: { allowed: boolean; reason?: string; warmupDailyCap?: number } }>();

export async function getAccountSafety(accountId: string): Promise<{ allowed: boolean; reason?: string; warmupDailyCap?: number }> {
  const cached = safetyCache.get(accountId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const account = await runSystemQuery(() => prisma.zaloAccount.findUnique({ where: { id: accountId }, select: { safetyStatus: true, suspendedReason: true, createdAt: true } }));
  let value: { allowed: boolean; reason?: string; warmupDailyCap?: number };
  if (!account) value = { allowed: false, reason: 'Zalo account not found' };
  else if (account.safetyStatus === 'suspended') value = { allowed: false, reason: account.suspendedReason || 'Zalo account is suspended' };
  else {
    const ageDays = Math.floor((Date.now() - account.createdAt.getTime()) / 86_400_000);
    const caps = [25, 50, 100, 200];
    value = { allowed: true, warmupDailyCap: ageDays < caps.length ? caps[Math.max(0, ageDays)] : undefined };
  }
  safetyCache.set(accountId, { expiresAt: Date.now() + SAFETY_CACHE_TTL_MS, value });
  return value;
}

export async function suspendAccountIfRisk(accountId: string, error: unknown): Promise<boolean> {
  const message = error instanceof Error ? error.message : String(error);
  if (!SUSPENSION_PATTERNS.test(message)) return false;
  await runSystemQuery(() => prisma.zaloAccount.update({ where: { id: accountId }, data: { safetyStatus: 'suspended', suspendedAt: new Date(), suspendedReason: message.slice(0, 1000), status: 'disconnected' } }));
  safetyCache.set(accountId, {
    expiresAt: Date.now() + SAFETY_CACHE_TTL_MS,
    value: { allowed: false, reason: message.slice(0, 1000) },
  });
  return true;
}
