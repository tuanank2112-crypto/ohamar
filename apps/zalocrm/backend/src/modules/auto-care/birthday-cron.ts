// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * birthday-cron.ts — Chúc mừng sinh nhật + voucher (yêu cầu (3)).
 *
 * 09:00 VN mỗi ngày: với mỗi org bật birthdayGreetingEnabled, tìm KH có birthDate
 * trùng NGÀY-THÁNG hôm nay → gửi lời chúc (render template + mã voucher cố định).
 * Dedup theo NĂM (1 lần/năm/KH) qua ActivityLog action 'birthday_greeting'.
 *
 * Voucher = mã cố định dùng chung (org.birthdayVoucherCode) — không cần model riêng.
 */
import cron from 'node-cron';
import type { Server } from 'socket.io';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { runSystemQuery, withTenant } from '../../shared/tenant/tenant-context.js';
import { logActivity } from '../activity/activity-logger.js';
import { renderMessageTemplate } from '../../shared/templating/template-renderer.js';
import { sendAutomatedCustomerMessage, type AutoCareConversation } from './auto-care-send.js';
import { withinSendWindow, vnMonthDay, vnYear } from './auto-care-time.js';

const SEND_HOUR_START = 6;
const SEND_HOUR_END = 22;
const MAX_PER_ORG_PER_TICK = 500;

const isDryRun = () => process.env.AUTO_CARE_DRY_RUN === '1';
// QA-only: bỏ qua khung giờ 6-22h để chạy tay ngoài giờ. KHÔNG bật ở production.
const ignoreWindow = () => process.env.AUTO_CARE_IGNORE_WINDOW === '1';

const DEFAULT_TEMPLATE =
  'Chúc mừng sinh nhật {{contact.fullName}}! 🎉 {{org.name}} gửi bạn ưu đãi đặc biệt nhân ngày này. Chúc bạn thật nhiều sức khỏe và niềm vui!';

let cronTask: ReturnType<typeof cron.schedule> | null = null;
let running = false;

export function startBirthdayCron(io: Server): void {
  if (cronTask) return; // idempotent
  // 02:00 UTC = 09:00 VN.
  cronTask = cron.schedule('0 2 * * *', async () => {
    if (running) {
      logger.info('[birthday] tick trước còn chạy, skip (overlap guard)');
      return;
    }
    running = true;
    try {
      await runBirthdayOnce(io);
    } catch (err) {
      logger.error('[birthday] tick error:', err);
    } finally {
      running = false;
    }
  });
  logger.info('[birthday] greeting cron scheduled (09:00 VN daily)');
}

export function stopBirthdayCron(): void {
  cronTask?.stop();
  cronTask = null;
}

/** Ghép nội dung: render template + chèn dòng voucher (nếu có). */
export function buildBirthdayMessage(
  template: string | null,
  voucherCode: string | null,
  ctx: { contact: { id: string; fullName: string | null; phone: string | null; status: string | null }; org: { id: string; name: string | null } },
): string {
  const base = renderMessageTemplate((template?.trim() || DEFAULT_TEMPLATE), ctx);
  const code = voucherCode?.trim();
  return code ? `${base}\n\n🎁 Mã ưu đãi của bạn: ${code}` : base;
}

/** Quét + gửi 1 lượt. Export để test/dry-run gọi tay. */
export async function runBirthdayOnce(io: Server | null): Promise<{ scanned: number; sent: number }> {
  const now = new Date();
  if (!ignoreWindow() && !withinSendWindow(now, SEND_HOUR_START, SEND_HOUR_END)) {
    return { scanned: 0, sent: 0 };
  }
  const todayMMDD = vnMonthDay(now);
  const year = vnYear(now);
  const yearStart = new Date(Date.UTC(year, 0, 1)); // dedup theo năm (mọi tz đủ chặt)

  const orgs = await runSystemQuery(() =>
    prisma.organization.findMany({
      where: { birthdayGreetingEnabled: true },
      select: { id: true, name: true, birthdayMessageTemplate: true, birthdayVoucherCode: true },
    }),
  );

  let scanned = 0;
  let sent = 0;

  for (const org of orgs) {
    await withTenant(org.id, async () => {
      // Contact có birthDate + có Zalo + chưa revoke. Lọc MM-DD trong JS (birthDate là @db.Date).
      const contacts = await prisma.contact.findMany({
        where: {
          birthDate: { not: null },
          consentStatus: { not: 'revoked' },
          // Loại KH đã xác nhận KHÔNG có Zalo (false). null (chưa backfill) vẫn nhận —
          // `{not:false}` sẽ loại null theo SQL 3-trị nên phải OR tường minh.
          OR: [{ hasZalo: true }, { hasZalo: null }],
        },
        select: { id: true, fullName: true, phone: true, status: true, birthDate: true },
        take: MAX_PER_ORG_PER_TICK * 4, // dư để lọc MM-DD; birthDate index không có nên cap thô
      });

      for (const c of contacts) {
        if (!c.birthDate) continue;
        // birthDate là DATE (UTC midnight) → so MM-DD theo UTC (không lệch vì không có giờ).
        const mm = String(c.birthDate.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(c.birthDate.getUTCDate()).padStart(2, '0');
        if (`${mm}-${dd}` !== todayMMDD) continue;
        scanned++;

        // Dedup theo năm.
        const already = await prisma.activityLog.findFirst({
          where: {
            orgId: org.id,
            entityType: 'contact',
            entityId: c.id,
            action: 'birthday_greeting',
            createdAt: { gte: yearStart },
          },
          select: { id: true },
        });
        if (already) continue;

        // Chọn conversation 1-1 gửi được (gần nhất, nick đang kết nối).
        const conv = await prisma.conversation.findFirst({
          where: {
            contactId: c.id,
            threadType: 'user',
            isVirtual: false,
            deletedAt: null,
            externalThreadId: { not: null },
            zaloAccount: { is: { status: 'connected' } },
          },
          select: {
            id: true, orgId: true, zaloAccountId: true, externalThreadId: true,
            zaloAccount: { select: { zaloUid: true, privacyMode: true, ownerUserId: true } },
          },
          orderBy: { lastMessageAt: 'desc' },
        });
        if (!conv) continue;

        const text = buildBirthdayMessage(org.birthdayMessageTemplate, org.birthdayVoucherCode, {
          contact: { id: c.id, fullName: c.fullName, phone: c.phone, status: c.status },
          org: { id: org.id, name: org.name },
        });

        if (isDryRun()) {
          logger.info(`[birthday][DRY_RUN] contact=${c.id} → "${text.slice(0, 120)}"`);
          continue;
        }

        const result = await sendAutomatedCustomerMessage(
          conv as AutoCareConversation, text, io, 'birthday_greeting',
        );
        if (result === 'sent') {
          sent++;
          logActivity({
            orgId: org.id,
            systemSource: 'birthday_cron',
            category: 'automation',
            action: 'birthday_greeting',
            entityType: 'contact',
            entityId: c.id,
            details: { conversationId: conv.id, year },
          });
        }
      }
    });
  }

  if (sent > 0 || scanned > 0) logger.info(`[birthday] greeting: scanned=${scanned}, sent=${sent}`);
  return { scanned, sent };
}
