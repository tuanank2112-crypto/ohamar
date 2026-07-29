// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * zalo-rate-limiter.ts — Per-account, per-operation-type rate limiting.
 * Uses Redis when REDIS_URL is set, otherwise in-memory Maps.
 * Fail-open: if checking fails, operations are allowed through.
 */
import type { OpCategory } from '../../shared/zalo-operations.js';
import type { RedisClient } from '../../shared/redis-client.js';
import { getRedis } from '../../shared/redis-client.js';
// 2026-06-06 (Anh chốt) — trần SDK đọc từ DB (cấu hình ở màn Quản lý nick Zalo),
// KHÔNG còn hardcode trong file này.
import { getEffectiveLimit, ALL_CATEGORIES, DEFAULT_SDK_LIMITS, type CategoryLimit } from './sdk-limit-service.js';
import { getAccountSafety } from './account-safety-service.js';

interface DailyCounter { count: number; date: string; }

const DAILY_KEY = (acct: string, cat: string) => `rl:daily:${acct}:${cat}`;
const BURST_KEY = (acct: string, cat: string) => `rl:burst:${acct}:${cat}`;

class ZaloRateLimiter {
  private dailyCounts = new Map<string, DailyCounter>();
  private recentSends = new Map<string, number[]>();
  private redis: RedisClient | null = null;
  private redisChecked = false;

  private async getRedisClient(): Promise<RedisClient | null> {
    if (!this.redisChecked) {
      this.redisChecked = true;
      this.redis = await getRedis();
    }
    return this.redis;
  }

  async checkLimits(accountId: string, category: OpCategory = 'message'): Promise<{ allowed: boolean; reason?: string }> {
    try {
      // #2026-06-06 (Anh chốt) — trần đọc từ DB (nick override → org default → fallback),
      // KHÔNG còn hardcode CATEGORY_LIMITS. Cache 60s trong sdk-limit-service.
      const eff = await getEffectiveLimit(accountId, category);
      const safety = await getAccountSafety(accountId);
      if (!safety.allowed) return { allowed: false, reason: safety.reason };
      const limits: CategoryLimit = {
        daily: category === 'message' && safety.warmupDailyCap ? Math.min(eff.daily, safety.warmupDailyCap) : eff.daily,
        burst: eff.burst,
        burstWindowMs: eff.burstWindowMs,
      };
      const r = await this.getRedisClient();

      if (r) return this.checkRedis(r, accountId, category, limits);
      return this.checkMemory(accountId, category, limits);
    } catch {
      return { allowed: true };
    }
  }

  async reserveSend(accountId: string, category: OpCategory = 'message'): Promise<{ allowed: boolean; reason?: string }> {
    try {
      const eff = await getEffectiveLimit(accountId, category);
      const safety = await getAccountSafety(accountId);
      if (!safety.allowed) return { allowed: false, reason: safety.reason };
      const limits: CategoryLimit = {
        daily: category === 'message' && safety.warmupDailyCap ? Math.min(eff.daily, safety.warmupDailyCap) : eff.daily,
        burst: eff.burst,
        burstWindowMs: eff.burstWindowMs,
      };
      const r = await this.getRedisClient();

      if (r) return this.reserveRedis(r, accountId, category, limits);
      return this.reserveMemory(accountId, category, limits);
    } catch {
      return { allowed: true };
    }
  }

  private checkMemory(accountId: string, category: OpCategory, limits: CategoryLimit): { allowed: boolean; reason?: string } {
    const key = `${accountId}:${category}`;
    const today = new Date().toISOString().split('T')[0];

    const daily = this.dailyCounts.get(key);
    if (daily && daily.date === today && daily.count >= limits.daily) {
      return { allowed: false, reason: `Đã đạt giới hạn ${limits.daily} ${category}/ngày` };
    }

    const now = Date.now();
    const recent = (this.recentSends.get(key) || []).filter(t => now - t < limits.burstWindowMs);
    if (recent.length >= limits.burst) {
      return { allowed: false, reason: `Quá nhanh (>${limits.burst} ${category}/${Math.round(limits.burstWindowMs / 1000)}s)` };
    }
    return { allowed: true };
  }

  private reserveMemory(accountId: string, category: OpCategory, limits: CategoryLimit): { allowed: boolean; reason?: string } {
    const key = `${accountId}:${category}`;
    const today = new Date().toISOString().split('T')[0];
    const now = Date.now();

    const daily = this.dailyCounts.get(key);
    if (daily && daily.date === today && daily.count >= limits.daily) {
      return { allowed: false, reason: `Đã đạt giới hạn ${limits.daily} ${category}/ngày` };
    }

    const recent = (this.recentSends.get(key) || []).filter(t => now - t < limits.burstWindowMs);
    if (recent.length >= limits.burst) {
      return { allowed: false, reason: `Quá nhanh (>${limits.burst} ${category}/${Math.round(limits.burstWindowMs / 1000)}s)` };
    }

    recent.push(now);
    this.recentSends.set(key, recent);
    if (daily && daily.date === today) daily.count++;
    else this.dailyCounts.set(key, { count: 1, date: today });
    return { allowed: true };
  }

  private async checkRedis(r: RedisClient, accountId: string, category: OpCategory, limits: CategoryLimit): Promise<{ allowed: boolean; reason?: string }> {
    const today = new Date().toISOString().split('T')[0];
    const dailyKey = DAILY_KEY(accountId, category);
    const dailyVal = await r.hget(dailyKey, today);
    const dailyCount = dailyVal ? parseInt(dailyVal, 10) : 0;

    if (dailyCount >= limits.daily) {
      return { allowed: false, reason: `Đã đạt giới hạn ${limits.daily} ${category}/ngày` };
    }

    const burstKey = BURST_KEY(accountId, category);
    const now = Date.now();
    await r.zremrangebyscore(burstKey, '-inf', String(now - limits.burstWindowMs));
    const burstCount = await r.zcard(burstKey);

    if (burstCount >= limits.burst) {
      return { allowed: false, reason: `Quá nhanh (>${limits.burst} ${category}/${Math.round(limits.burstWindowMs / 1000)}s)` };
    }
    return { allowed: true };
  }

  private async reserveRedis(r: RedisClient, accountId: string, category: OpCategory, limits: CategoryLimit): Promise<{ allowed: boolean; reason?: string }> {
    const today = new Date().toISOString().split('T')[0];
    const now = Date.now();
    const result = await r.eval(
      `
      local dailyKey = KEYS[1]
      local burstKey = KEYS[2]
      local dayField = ARGV[1]
      local nowMs = tonumber(ARGV[2])
      local windowMs = tonumber(ARGV[3])
      local dailyLimit = tonumber(ARGV[4])
      local burstLimit = tonumber(ARGV[5])
      local member = ARGV[6]

      redis.call('ZREMRANGEBYSCORE', burstKey, '-inf', tostring(nowMs - windowMs))

      local dailyCount = tonumber(redis.call('HGET', dailyKey, dayField) or '0')
      if dailyCount >= dailyLimit then
        return {0, 'daily'}
      end

      local burstCount = tonumber(redis.call('ZCARD', burstKey) or '0')
      if burstCount >= burstLimit then
        return {0, 'burst'}
      end

      redis.call('HINCRBY', dailyKey, dayField, 1)
      redis.call('EXPIRE', dailyKey, 172800)
      redis.call('ZADD', burstKey, nowMs, member)
      redis.call('PEXPIRE', burstKey, 120000)
      return {1, ''}
      `,
      2,
      DAILY_KEY(accountId, category),
      BURST_KEY(accountId, category),
      today,
      String(now),
      String(limits.burstWindowMs),
      String(limits.daily),
      String(limits.burst),
      `${now}:${process.pid}:${Math.random().toString(36).slice(2)}`,
    ) as [number, string];

    const [allowed, reason] = result;
    if (Number(allowed) === 1) return { allowed: true };
    if (reason === 'daily') return { allowed: false, reason: `Đã đạt giới hạn ${limits.daily} ${category}/ngày` };
    return { allowed: false, reason: `Quá nhanh (>${limits.burst} ${category}/${Math.round(limits.burstWindowMs / 1000)}s)` };
  }

  async recordSend(accountId: string, category: OpCategory = 'message'): Promise<void> {
    const r = await this.getRedisClient();
    if (r) {
      try {
        const today = new Date().toISOString().split('T')[0];
        const dailyKey = DAILY_KEY(accountId, category);
        await r.hincrby(dailyKey, today, 1);
        await r.expire(dailyKey, 86400 * 2);

        const burstKey = BURST_KEY(accountId, category);
        const now = Date.now();
        await r.zadd(burstKey, String(now), `${now}`);
        await r.pexpire(burstKey, 120_000);
        return;
      } catch { /* fall through to in-memory */ }
    }

    const key = `${accountId}:${category}`;
    const now = Date.now();
    const today = new Date().toISOString().split('T')[0];

    const recent = (this.recentSends.get(key) || []).filter(t => now - t < 60_000);
    recent.push(now);
    this.recentSends.set(key, recent);

    const daily = this.dailyCounts.get(key);
    if (daily && daily.date === today) daily.count++;
    else this.dailyCounts.set(key, { count: 1, date: today });
  }

  // 2026-06-06 — đếm OPERATION-LEVEL riêng (vd 'contact_sync' = getAllFriends) cho dashboard.
  // Không ảnh hưởng rate-limit (chỉ là counter metric). Key: rl:op:<acct>:<op>.
  async recordOperation(accountId: string, op: string): Promise<void> {
    const r = await this.getRedisClient();
    if (!r) return;
    try {
      const today = new Date().toISOString().split('T')[0];
      const key = `rl:op:${accountId}:${op}`;
      await r.hincrby(key, today, 1);
      await r.expire(key, 86400 * 9); // giữ ~9 ngày cho sparkline 7 ngày
    } catch { /* metric best-effort */ }
  }

  async getOperationCount(accountId: string, op: string): Promise<number> {
    const r = await this.getRedisClient();
    if (!r) return 0;
    try {
      const today = new Date().toISOString().split('T')[0];
      const val = await r.hget(`rl:op:${accountId}:${op}`, today);
      return val ? parseInt(val, 10) : 0;
    } catch { return 0; }
  }

  async getDailyCount(accountId: string, category: OpCategory = 'message'): Promise<number> {
    const r = await this.getRedisClient();
    if (r) {
      try {
        const today = new Date().toISOString().split('T')[0];
        const val = await r.hget(DAILY_KEY(accountId, category), today);
        return val ? parseInt(val, 10) : 0;
      } catch { /* fall through */ }
    }

    const key = `${accountId}:${category}`;
    const today = new Date().toISOString().split('T')[0];
    const daily = this.dailyCounts.get(key);
    return daily && daily.date === today ? daily.count : 0;
  }

  async getAllDailyCounts(accountId: string): Promise<Record<string, number>> {
    const result: Record<string, number> = {};
    const r = await this.getRedisClient();
    if (r) {
      try {
        const today = new Date().toISOString().split('T')[0];
        const pipeline = r.pipeline();
        for (const cat of ALL_CATEGORIES) {
          pipeline.hget(DAILY_KEY(accountId, cat), today);
        }
        const rows = await pipeline.exec();
        ALL_CATEGORIES.forEach((cat, index) => {
          const value = rows?.[index]?.[1];
          result[cat] = value ? parseInt(String(value), 10) || 0 : 0;
        });
        return result;
      } catch { /* fall through to sequential fallback */ }
    }
    for (const cat of ALL_CATEGORIES) {
      result[cat] = await this.getDailyCount(accountId, cat as OpCategory);
    }
    return result;
  }
}

export const zaloRateLimiter = new ZaloRateLimiter();
