/**
 * ohamar-ingest.ts — nhận event từ lead-core, ghi Conversation/Message
 * vào Postgres CRM và bắn realtime để hiện trong giao diện chat.
 */
import { prisma } from '../../shared/database/prisma-client.js';
import { emitChatMessage } from '../../shared/realtime/emit-chat.js';
import { zaloPool } from '../zalo/zalo-pool.js';

const FEED_TOKEN = (process.env.OHAMAR_FEED_TOKEN || '').trim();

export function ingestTokenOk(auth?: string): boolean {
    if (!FEED_TOKEN) return false;
    const m = /^Bearer\s+(.+)$/i.exec(auth || '');
    return Boolean(m && m[1].trim() === FEED_TOKEN);
}

// zalo_main -> nick ảo "Gia Huy" ; zalo_worker -> "Minh Phát"
function botKeyForChannel(channel: string): 'main' | 'worker' {
    return channel === 'zalo_worker' ? 'worker' : 'main';
}

const ACCOUNT_META: Record<'main' | 'worker', { zaloUid: string; displayName: string }> = {
    main: { zaloUid: 'ohamar:main', displayName: 'Gia Huy (bot)' },
    worker: { zaloUid: 'ohamar:worker', displayName: 'Minh Phát (bot)' },
};

export type OhamarIngestPayload = {
    direction: 'in' | 'out';
    channel: string;
    thread_id: string;
    source_user_id?: string | null;
    source_message_id?: string | null;
    text?: string | null;
    ts?: string;
};

export async function ingestOhamarEvent(payload: OhamarIngestPayload) {
    const text = (payload.text ?? '').toString();
    if (!text.trim()) return { skipped: 'empty' };
    const threadId = (payload.thread_id || '').toString().trim();
    if (!threadId) return { skipped: 'no_thread' };

    const botKey = botKeyForChannel(payload.channel || '');
    const meta = ACCOUNT_META[botKey];
    const account = await prisma.zaloAccount.findUnique({ where: { zaloUid: meta.zaloUid } });
    if (!account) return { skipped: 'no_account', bot: botKey };

    const { id: zaloAccountId, orgId } = account;

    const conv = await prisma.conversation.upsert({
        where: { zaloAccountId_externalThreadId: { zaloAccountId, externalThreadId: threadId } },
        update: { lastMessageAt: new Date() },
        create: {
            orgId,
            zaloAccountId,
            threadType: 'user',
            externalThreadId: threadId,
            lastMessageAt: new Date(),
            isReplied: payload.direction === 'out',
        },
    });

    const senderType = payload.direction === 'out' ? 'self' : 'contact';
    const senderName = senderType === 'self' ? meta.displayName : (payload.source_user_id || 'Khách');
    const zaloMsgId = payload.source_message_id
        ? `ohamar:${payload.source_message_id}`
        : `ohamar:${threadId}:${Date.now()}`;

    // dedup thủ công (Message.zaloMsgId không unique toàn cục)
    const dup = await prisma.message.findFirst({
        where: { conversationId: conv.id, zaloMsgId },
        select: { id: true },
    });
    if (dup) return { duplicate: true };

    let created;
    try {
        created = await prisma.message.create({
            data: {
                conversationId: conv.id,
                zaloMsgId,
                senderType,                                   // 'self' | 'contact'
                senderUid: payload.source_user_id ?? null,
                senderName,
                content: text,
                contentType: 'text',
                sentAt: payload.ts ? new Date(payload.ts) : new Date(),
                sentVia: senderType === 'self' ? 'automation' : 'user',
                metadata: { sender: { kind: senderType, name: senderName, via: 'ohamar' } },
            },
        });
    } catch (e: any) {
        if (e?.code === 'P2002') return { duplicate: true };
        throw e;
    }

    await prisma.conversation.update({
        where: { id: conv.id },
        data: {
            lastMessageAt: created.sentAt,
            isReplied: senderType === 'self',
            ...(senderType === 'contact' ? { unreadCount: { increment: 1 } } : {}),
        },
    });

    try {
        await emitChatMessage({
            io: zaloPool.getIO(),
            orgId,
            accountId: zaloAccountId,
            conversationId: conv.id,
            message: created,
            privacyMode: (account as any).privacyMode ?? 'sub',
            ownerUserId: account.ownerUserId,
        });
    } catch { /* realtime best-effort */ }

    return { ok: true, conversationId: conv.id, messageId: created.id };
}

/** Tạo/ cập nhật 2 nick ảo. Tự chọn org + owner đầu tiên nếu không truyền. */
export async function provisionOhamarAccounts(opts: { orgId?: string; ownerUserId?: string } = {}) {
    let orgId = opts.orgId;
    let ownerUserId = opts.ownerUserId;
    if (!orgId) orgId = (await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } }))?.id;
    if (!ownerUserId)
        ownerUserId = (await prisma.user.findFirst({
            where: orgId ? { orgId } : undefined,
            orderBy: { createdAt: 'asc' },
        }))?.id;
    if (!orgId || !ownerUserId) return { error: 'no org/user found', orgId, ownerUserId };

    const accounts = [];
    for (const botKey of ['main', 'worker'] as const) {
        const meta = ACCOUNT_META[botKey];
        const acc = await prisma.zaloAccount.upsert({
            where: { zaloUid: meta.zaloUid },
            update: { displayName: meta.displayName, status: 'connected' },
            create: {
                orgId, ownerUserId,
                zaloUid: meta.zaloUid,
                displayName: meta.displayName,
                status: 'connected',
                aiAutoEnabled: false,
                privacyMode: 'sub',
            },
        });
        accounts.push({ bot: botKey, id: acc.id, zaloUid: acc.zaloUid });
    }
    return { ok: true, orgId, ownerUserId, accounts };
}