// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * auto-care-send.ts — Gửi 1 tin TEXT tự động cho KHÁCH + persist, dùng chung cho
 * auto-care follow-up (24h) và chúc mừng sinh nhật.
 *
 * Mọi gửi đi qua zaloOps.sendMessage → tự động reserveSend (rate-limit chống ban
 * nick, vá lỗ S-02: KHÔNG gọi thẳng api.sendMessage). Persist Message sentVia=
 * 'automation'; self-listen echo sau đó dedup qua unique [conversationId, zaloMsgId].
 *
 * Trả status để cron quyết định có ghi ActivityLog dedup hay không (Luật D4:
 * CHỈ log khi 'sent' để nhịp sau còn thử lại nếu 'failed').
 */
import { randomUUID } from 'node:crypto';
import type { Server } from 'socket.io';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { zaloOps } from '../../shared/zalo-operations.js';
import { extractZaloMsgId } from '../chat/chat-media-helpers.js';
import { emitChatMessage } from '../../shared/realtime/emit-chat.js';
import { applyContactAggregateFromMessage } from '../contacts/contact-aggregate.js';

const THREAD_USER = 0 as const; // ThreadType.User (1-1)

/** Conversation đã load đủ field để gửi + persist + emit realtime. */
export interface AutoCareConversation {
  id: string;
  orgId: string;
  zaloAccountId: string;
  externalThreadId: string | null;
  zaloAccount: { zaloUid: string | null; privacyMode: string; ownerUserId: string | null };
}

export type AutoCareSendResult = 'sent' | 'failed' | 'skipped';

/**
 * Gửi text tới KH qua nick của conversation, persist Message, cập nhật aggregate,
 * emit realtime. Nuốt lỗi Zalo (rate-limit / mất kết nối) → trả 'failed', KHÔNG throw.
 *
 * @param source nhãn ghi vào Message.metadata.sender.detail (vd 'auto_care_followup').
 */
export async function sendAutomatedCustomerMessage(
  conversation: AutoCareConversation,
  text: string,
  io: Server | null | undefined,
  source: string,
): Promise<AutoCareSendResult> {
  const threadId = conversation.externalThreadId;
  if (!threadId) return 'skipped';
  const body = text?.trim();
  if (!body) return 'skipped';

  let sdkResult: unknown;
  try {
    sdkResult = await zaloOps.sendMessage(conversation.zaloAccountId, threadId, THREAD_USER, { msg: body }, io);
  } catch (err) {
    logger.warn(`[auto-care-send] gửi Zalo thất bại (conv=${conversation.id}, source=${source}):`, err);
    return 'failed';
  }

  try {
    const zaloMsgId = extractZaloMsgId(sdkResult);
    const sentAt = new Date();
    const created = await prisma.message.create({
      data: {
        id: randomUUID(),
        conversationId: conversation.id,
        zaloMsgId: zaloMsgId || null,
        zaloMsgIdNum: zaloMsgId && /^\d+$/.test(zaloMsgId) ? BigInt(zaloMsgId) : null,
        senderType: 'self',
        senderUid: conversation.zaloAccount.zaloUid || '',
        senderName: 'Auto-Care',
        content: body,
        contentType: 'text',
        sentAt,
        sentVia: 'automation',
        metadata: { sender: { kind: 'automation', name: 'Auto-Care', detail: source } },
      },
      select: {
        id: true, content: true, contentType: true, sentAt: true, zaloMsgId: true,
        zaloMsgIdNum: true, senderType: true, senderUid: true, senderName: true,
        conversationId: true, sentVia: true, metadata: true,
      },
    });

    // Aggregate outbound (lastOutboundAt + counter) — best-effort.
    void applyContactAggregateFromMessage({
      conversationId: conversation.id,
      message: { id: created.id, content: created.content, contentType: created.contentType, sentAt: created.sentAt, senderType: 'self' },
      outboundUserId: null,
    });

    // Conversation aggregate: outbound → đã trả lời, clear unread.
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: sentAt, isReplied: true, unreadCount: 0, deletedAt: null },
    }).catch((e) => logger.warn(`[auto-care-send] update conversation failed (conv=${conversation.id}):`, e));

    // Realtime (scope org + privacy) — best-effort.
    const safeMessage = { ...created, zaloMsgIdNum: created.zaloMsgIdNum?.toString() ?? null };
    await emitChatMessage({
      io,
      orgId: conversation.orgId,
      accountId: conversation.zaloAccountId,
      conversationId: conversation.id,
      message: safeMessage,
      privacyMode: conversation.zaloAccount.privacyMode,
      ownerUserId: conversation.zaloAccount.ownerUserId,
    }).catch(() => {});

    return 'sent';
  } catch (err) {
    // Tin ĐÃ gửi tới KH nhưng persist lỗi → self-listen echo sẽ lưu sau (không mất tin).
    // Trả 'sent' để cron dedup, tránh gửi lặp cho KH.
    logger.warn(`[auto-care-send] persist thất bại nhưng tin đã gửi (conv=${conversation.id}):`, err);
    return 'sent';
  }
}
