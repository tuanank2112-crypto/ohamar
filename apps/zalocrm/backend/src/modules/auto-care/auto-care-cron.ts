// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * auto-care-cron.ts — Follow-up 24h tự động (yêu cầu (1)+(2)).
 *
 * Mỗi 30 phút: với mỗi org bật autoCareFollowupEnabled, quét hội thoại KH im lặng
 * > delayHours mà SALE CHƯA CAN THIỆP → AI soạn tin chăm sóc → gửi qua nick.
 *
 * "Sale chưa can thiệp" (chốt với user) = TẤT CẢ:
 *   - conv.isReplied=false  (tin cuối là của KHÁCH, chưa ai trả lời)
 *   - conv.aiMode='AUTO' & handoffStatus != 'TAKEN'  (sale chưa bấm "tôi tiếp quản")
 *   - contact.lastOutboundAt null hoặc < now - saleQuietHours  (sale không vừa nhắn)
 *   - chưa gửi auto_care_followup cho LƯỢT im này (dedup ActivityLog >= lastMessageAt)
 *
 * An toàn: gửi qua sendAutomatedCustomerMessage → zaloOps rate-limit. Chỉ giờ 6-22h VN.
 * Idempotent: overlap guard + dedup ActivityLog. Chỉ log khi 'sent' (Luật D4).
 */
import cron from 'node-cron';
import type { Server } from 'socket.io';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { runSystemQuery, withTenant } from '../../shared/tenant/tenant-context.js';
import { logActivity } from '../activity/activity-logger.js';
import { getAiUsage, generateCareFollowupMessage } from '../ai/ai-service.js';
import { sendAutomatedCustomerMessage, type AutoCareConversation } from './auto-care-send.js';
import { withinSendWindow } from './auto-care-time.js';

const SEND_HOUR_START = 6;
const SEND_HOUR_END = 22;
const MAX_PER_ORG_PER_TICK = 100;
const CATALOG_CONTEXT_LIMIT = 12; // số sản phẩm active đưa vào prompt

const isDryRun = () => process.env.AUTO_CARE_DRY_RUN === '1';
// QA-only: bỏ qua khung giờ 6-22h để chạy tay ngoài giờ. KHÔNG bật ở production.
const ignoreWindow = () => process.env.AUTO_CARE_IGNORE_WINDOW === '1';

let cronTask: ReturnType<typeof cron.schedule> | null = null;
let running = false;

export function startAutoCareCron(io: Server): void {
  if (cronTask) return; // idempotent
  // Mỗi 30 phút. Bên trong tự lọc khung giờ 6-22h VN per-tick.
  cronTask = cron.schedule('*/30 * * * *', async () => {
    if (running) {
      logger.info('[auto-care] tick trước còn chạy, skip (overlap guard)');
      return;
    }
    running = true;
    try {
      await runAutoCareOnce(io);
    } catch (err) {
      logger.error('[auto-care] tick error:', err);
    } finally {
      running = false;
    }
  });
  logger.info('[auto-care] follow-up cron scheduled (mỗi 30 phút, gửi 6-22h VN)');
}

export function stopAutoCareCron(): void {
  cronTask?.stop();
  cronTask = null;
}

/** Rút gọn catalog active của org thành context text cho AI (đã trong withTenant). */
async function buildCatalogContext(): Promise<string> {
  const items = await prisma.catalogItem.findMany({
    where: { status: 'active' },
    select: { name: true, price: true, currency: true, description: true },
    orderBy: { updatedAt: 'desc' },
    take: CATALOG_CONTEXT_LIMIT,
  });
  return items
    .map((it) => {
      const price = it.price != null ? ` — ${it.price.toString()} ${it.currency}` : '';
      const desc = it.description?.trim() ? `: ${it.description.trim().slice(0, 160)}` : '';
      return `- ${it.name}${price}${desc}`;
    })
    .join('\n');
}

/**
 * Quét + gửi 1 lượt. Export để test/dry-run gọi tay. Trả số liệu.
 */
export async function runAutoCareOnce(io: Server | null): Promise<{ scanned: number; sent: number }> {
  const now = new Date();
  if (!ignoreWindow() && !withinSendWindow(now, SEND_HOUR_START, SEND_HOUR_END)) {
    return { scanned: 0, sent: 0 };
  }

  const orgs = await runSystemQuery(() =>
    prisma.organization.findMany({
      where: { autoCareFollowupEnabled: true },
      select: { id: true, autoCareFollowupDelayHours: true, autoCareSaleQuietHours: true },
    }),
  );

  let scanned = 0;
  let sent = 0;

  for (const org of orgs) {
    const delayHours = org.autoCareFollowupDelayHours ?? 24;
    const quietHours = org.autoCareSaleQuietHours ?? 24;
    const silenceCutoff = new Date(now.getTime() - delayHours * 3600_000);
    const saleQuietCutoff = new Date(now.getTime() - quietHours * 3600_000);

    await withTenant(org.id, async () => {
      // Quota AI — hết thì bỏ qua org này.
      const usage = await getAiUsage(org.id);
      if (!usage.enabled || usage.remaining <= 0) return;

      const candidates = await prisma.conversation.findMany({
        where: {
          isReplied: false,
          aiMode: 'AUTO',
          handoffStatus: { not: 'TAKEN' },
          isVirtual: false,
          deletedAt: null,
          threadType: 'user',
          lastMessageAt: { lte: silenceCutoff },
          externalThreadId: { not: null },
          contact: {
            is: {
              consentStatus: { not: 'revoked' },
              // hasZalo: chỉ loại KH đã xác nhận KHÔNG có Zalo (false). null = chưa backfill
              // nhưng có thread 1-1 → coi như có. `{not:false}` sẽ loại null (SQL 3-trị) nên phải OR tường minh.
              AND: [
                { OR: [{ hasZalo: true }, { hasZalo: null }] },
                { OR: [{ lastOutboundAt: null }, { lastOutboundAt: { lt: saleQuietCutoff } }] },
              ],
            },
          },
        },
        select: {
          id: true, orgId: true, zaloAccountId: true, externalThreadId: true, lastMessageAt: true,
          contactId: true,
          zaloAccount: { select: { zaloUid: true, privacyMode: true, ownerUserId: true, status: true } },
        },
        orderBy: { lastMessageAt: 'asc' },
        take: MAX_PER_ORG_PER_TICK,
      });

      if (!candidates.length) return;

      let budget = usage.remaining;
      const catalogContext = await buildCatalogContext();

      for (const conv of candidates) {
        if (budget <= 0) break;
        scanned++;

        // Nick phải đang kết nối (tránh chắc chắn fail).
        if (conv.zaloAccount.status !== 'connected') continue;

        // Dedup: đã gửi follow-up cho LƯỢT im này chưa? (log SAU lastMessageAt)
        const already = await prisma.activityLog.findFirst({
          where: {
            orgId: org.id,
            entityType: 'contact',
            entityId: conv.contactId,
            action: 'auto_care_followup',
            createdAt: { gte: conv.lastMessageAt ?? new Date(0) },
          },
          select: { id: true },
        });
        if (already) continue;

        // AI soạn tin.
        let text: string | null = null;
        try {
          text = await generateCareFollowupMessage({ orgId: org.id, conversationId: conv.id, catalogContext });
        } catch (err) {
          logger.warn(`[auto-care] AI soạn tin lỗi (conv=${conv.id}):`, err);
          continue;
        }
        if (!text) continue;
        budget--; // đã tiêu 1 lượt AI

        if (isDryRun()) {
          logger.info(`[auto-care][DRY_RUN] conv=${conv.id} → "${text.slice(0, 120)}"`);
          continue;
        }

        const result = await sendAutomatedCustomerMessage(
          conv as AutoCareConversation, text, io, 'auto_care_followup',
        );
        if (result === 'sent') {
          sent++;
          logActivity({
            orgId: org.id,
            systemSource: 'auto_care_cron',
            category: 'automation',
            action: 'auto_care_followup',
            entityType: 'contact',
            entityId: conv.contactId,
            details: { conversationId: conv.id },
          });
        }
        // 'failed' → không log → nhịp sau thử lại. 'skipped' → bỏ qua.
      }
    });
  }

  if (sent > 0 || scanned > 0) logger.info(`[auto-care] follow-up: scanned=${scanned}, sent=${sent}`);
  return { scanned, sent };
}
