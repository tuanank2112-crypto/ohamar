// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * public-api-routes.ts — External REST API authenticated via API key (X-Api-Key header).
 * Provides read/write access to contacts, conversations, appointments, and message sending.
 * All routes prefixed /api/public/ — no JWT required, orgId injected from API key lookup.
 *
 * FIX S-01 (2026-07-07): API key auth now uses sha256 hash comparison with timingSafeEqual.
 * FIX S-02 (2026-07-07): /messages/send now enforces rate-limit + accountSafety check.
 * FIX S-10 (2026-07-07): Contact create/update validates status enum + tags array type.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'node:crypto';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { zaloRateLimiter } from '../zalo/zalo-rate-limiter.js';

// ── S-10: allowed status values ────────────────────────────────────────────────
const ALLOWED_CONTACT_STATUSES = [
  'new', 'contacted', 'qualified', 'negotiation', 'won', 'lost',
  'nurturing', 'follow_up', 'pending', 'active', 'inactive',
] as const;

const DEFAULT_PUBLIC_API_SCOPES = [
  'contacts:read',
  'contacts:write',
  'conversations:read',
  'appointments:read',
  'appointments:write',
  'messages:send',
] as const;

function validateContactStatus(status: unknown): boolean {
  if (status === undefined || status === null) return true;
  return typeof status === 'string' && (ALLOWED_CONTACT_STATUSES as readonly string[]).includes(status);
}

function validateTags(tags: unknown): boolean {
  if (tags === undefined || tags === null) return true;
  return Array.isArray(tags) && tags.every((t: unknown) => typeof t === 'string');
}

function timingSafeHexEqual(a: string, b: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(a) || !/^[a-f0-9]{64}$/i.test(b)) return false;
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

// ── API key auth middleware (FIX S-01: hash-based comparison) ──────────────────

async function apiKeyAuth(request: FastifyRequest, reply: FastifyReply) {
  const apiKey = request.headers['x-api-key'] as string;
  if (!apiKey) return reply.status(401).send({ error: 'API key required' });

  // FIX S-01: hash the incoming key and compare against stored hash.
  const incomingHash = crypto.createHash('sha256').update(apiKey).digest('hex');

  const now = new Date();
  const candidates = await prisma.publicApiKey.findMany({
    where: {
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { id: true, orgId: true, keyHash: true, scopes: true },
  });

  const matchedKey = candidates.find((candidate) =>
    timingSafeHexEqual(incomingHash, candidate.keyHash),
  ) ?? null;
  let setting: { orgId: string; scopes?: string[]; keyId?: string } | null = matchedKey
    ? { orgId: matchedKey.orgId, scopes: matchedKey.scopes, keyId: matchedKey.id }
    : null;

  // Fallback: legacy plaintext lookup (migration window — remove after migration)
  if (!setting) {
    const legacy = await prisma.appSetting.findFirst({
      where: { settingKey: 'public_api_key', valuePlain: apiKey },
    });
    if (legacy) {
      // Auto-migrate: create scoped key row and remove plaintext
      try {
        const created = await prisma.publicApiKey.upsert({
          where: { keyHash: incomingHash },
          create: {
            orgId: legacy.orgId,
            keyHash: incomingHash,
            keyPrefix: `${apiKey.slice(0, 9)}…`,
            name: 'Migrated legacy public API key',
            scopes: [...DEFAULT_PUBLIC_API_SCOPES],
          },
          update: { revokedAt: null },
        });
        await prisma.appSetting.deleteMany({
          where: { orgId: legacy.orgId, settingKey: { in: ['public_api_key', 'public_api_key_hash'] } },
        });
        setting = { orgId: legacy.orgId, scopes: created.scopes, keyId: created.id };
        logger.info(`[public-api] Auto-migrated API key to public_api_keys for org=${legacy.orgId}`);
      } catch (err) {
        logger.warn('[public-api] Failed to auto-migrate API key:', err);
      }
    }
  }

  // Fallback: legacy hash lookup from AppSetting migration window.
  if (!setting) {
    const hashedSettings = await prisma.appSetting.findMany({
      where: { settingKey: 'public_api_key_hash' },
      select: { orgId: true, valuePlain: true },
    });
    const legacyHash = hashedSettings.find((candidate) =>
      candidate.valuePlain ? timingSafeHexEqual(incomingHash, candidate.valuePlain) : false,
    ) ?? null;
    if (legacyHash) {
      setting = { orgId: legacyHash.orgId, scopes: [...DEFAULT_PUBLIC_API_SCOPES] };
    }
  }

  if (!setting) return reply.status(401).send({ error: 'Invalid API key' });

  (request as any).orgId = setting.orgId;
  (request as any).apiKeyScopes = setting.scopes?.length ? setting.scopes : [...DEFAULT_PUBLIC_API_SCOPES];
  if (setting.keyId) {
    prisma.publicApiKey.update({
      where: { id: setting.keyId },
      data: { lastUsedAt: new Date() },
    }).catch((err) => logger.warn('[public-api] Failed to update lastUsedAt:', err));
  }
}

function requirePublicScope(scope: string, request: FastifyRequest, reply: FastifyReply): boolean {
  const scopes = ((request as any).apiKeyScopes ?? []) as string[];
  if (scopes.includes(scope) || scopes.includes('*')) return true;
  reply.status(403).send({ error: `API key missing scope: ${scope}` });
  return false;
}

// ── Route registration ────────────────────────────────────────────────────────

export async function publicApiRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', apiKeyAuth);

  // ── Contacts ─────────────────────────────────────────────────────────────

  app.get('/api/public/contacts', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!requirePublicScope('contacts:read', request, reply)) return;
      const orgId = (request as any).orgId as string;
      const { search = '', status = '', limit = '20' } = request.query as Record<string, string>;

      const where: any = { orgId };
      if (status) where.status = status;
      if (search) {
        where.OR = [
          { fullName: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
          { email: { contains: search, mode: 'insensitive' } },
        ];
      }

      const contacts = await prisma.contact.findMany({
        where,
        select: {
          id: true, fullName: true, phone: true, email: true,
          source: true, status: true, notes: true, tags: true,
          createdAt: true, updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: Math.min(parseInt(limit) || 20, 100),
      });

      return { contacts };
    } catch (err) {
      logger.error('[public-api] GET /contacts error:', err);
      return reply.status(500).send({ error: 'Failed to fetch contacts' });
    }
  });

  app.get('/api/public/contacts/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!requirePublicScope('contacts:read', request, reply)) return;
      const orgId = (request as any).orgId as string;
      const { id } = request.params as { id: string };

      const contact = await prisma.contact.findFirst({
        where: { id, orgId },
        include: {
          appointments: { orderBy: { appointmentDate: 'desc' }, take: 5 },
          _count: { select: { conversations: true } },
        },
      });

      if (!contact) return reply.status(404).send({ error: 'Contact not found' });
      return contact;
    } catch (err) {
      logger.error('[public-api] GET /contacts/:id error:', err);
      return reply.status(500).send({ error: 'Failed to fetch contact' });
    }
  });

  app.post('/api/public/contacts', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!requirePublicScope('contacts:write', request, reply)) return;
      const orgId = (request as any).orgId as string;
      const body = request.body as Record<string, any>;

      if (!body?.fullName && !body?.phone) {
        return reply.status(400).send({ error: 'fullName or phone is required' });
      }

      // FIX S-10: validate status enum + tags array
      if (!validateContactStatus(body.status)) {
        return reply.status(400).send({ error: `Invalid status value. Allowed: ${ALLOWED_CONTACT_STATUSES.join(', ')}` });
      }
      if (!validateTags(body.tags)) {
        return reply.status(400).send({ error: 'tags must be an array of strings' });
      }

      const contact = await prisma.contact.create({
        data: {
          orgId,
          fullName: body.fullName,
          phone: body.phone,
          email: body.email,
          source: typeof body.source === 'string' ? body.source : undefined,
          status: body.status ?? 'new',
          notes: typeof body.notes === 'string' ? body.notes : undefined,
          tags: body.tags ?? [],
        },
      });

      return reply.status(201).send(contact);
    } catch (err) {
      logger.error('[public-api] POST /contacts error:', err);
      return reply.status(500).send({ error: 'Failed to create contact' });
    }
  });

  app.put('/api/public/contacts/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!requirePublicScope('contacts:write', request, reply)) return;
      const orgId = (request as any).orgId as string;
      const { id } = request.params as { id: string };
      const body = request.body as Record<string, any>;

      const existing = await prisma.contact.findFirst({ where: { id, orgId }, select: { id: true } });
      if (!existing) return reply.status(404).send({ error: 'Contact not found' });

      // FIX S-10: validate status enum + tags array
      if (!validateContactStatus(body.status)) {
        return reply.status(400).send({ error: `Invalid status value. Allowed: ${ALLOWED_CONTACT_STATUSES.join(', ')}` });
      }
      if (!validateTags(body.tags)) {
        return reply.status(400).send({ error: 'tags must be an array of strings' });
      }

      const updated = await prisma.contact.update({
        where: { id },
        data: {
          fullName: body.fullName,
          phone: body.phone,
          email: body.email,
          source: typeof body.source === 'string' ? body.source : undefined,
          status: body.status,
          notes: typeof body.notes === 'string' ? body.notes : undefined,
          tags: body.tags,
        },
      });

      return updated;
    } catch (err) {
      logger.error('[public-api] PUT /contacts/:id error:', err);
      return reply.status(500).send({ error: 'Failed to update contact' });
    }
  });

  // ── Conversations ─────────────────────────────────────────────────────────

  app.get('/api/public/conversations', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!requirePublicScope('conversations:read', request, reply)) return;
      const orgId = (request as any).orgId as string;
      const { limit = '20' } = request.query as Record<string, string>;

      const conversations = await prisma.conversation.findMany({
        where: { orgId, deletedAt: null },
        select: {
          id: true, threadType: true, externalThreadId: true,
          lastMessageAt: true, unreadCount: true, isReplied: true,
          contact: { select: { id: true, fullName: true, phone: true, avatarUrl: true } },
        },
        orderBy: { lastMessageAt: 'desc' },
        take: Math.min(parseInt(limit) || 20, 100),
      });

      return { conversations };
    } catch (err) {
      logger.error('[public-api] GET /conversations error:', err);
      return reply.status(500).send({ error: 'Failed to fetch conversations' });
    }
  });

  app.get('/api/public/conversations/:id/messages', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!requirePublicScope('conversations:read', request, reply)) return;
      const orgId = (request as any).orgId as string;
      const { id } = request.params as { id: string };
      const { limit = '50' } = request.query as Record<string, string>;

      const conv = await prisma.conversation.findFirst({ where: { id, orgId }, select: { id: true } });
      if (!conv) return reply.status(404).send({ error: 'Conversation not found' });

      const messages = await prisma.message.findMany({
        where: { conversationId: id, isDeleted: false },
        orderBy: { sentAt: 'desc' },
        take: Math.min(parseInt(limit) || 50, 200),
        select: {
          id: true, senderType: true, senderName: true,
          content: true, contentType: true, sentAt: true, attachments: true,
        },
      });

      return { messages };
    } catch (err) {
      logger.error('[public-api] GET /conversations/:id/messages error:', err);
      return reply.status(500).send({ error: 'Failed to fetch messages' });
    }
  });

  // ── Appointments ──────────────────────────────────────────────────────────

  app.get('/api/public/appointments', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!requirePublicScope('appointments:read', request, reply)) return;
      const orgId = (request as any).orgId as string;
      const { from, to } = request.query as Record<string, string>;

      const where: any = { orgId };
      if (from || to) {
        where.appointmentDate = {};
        if (from) where.appointmentDate.gte = new Date(from);
        if (to) where.appointmentDate.lte = new Date(to);
      }

      const appointments = await prisma.appointment.findMany({
        where,
        include: { contact: { select: { id: true, fullName: true, phone: true } } },
        orderBy: { appointmentDate: 'asc' },
        take: 100,
      });

      return { appointments };
    } catch (err) {
      logger.error('[public-api] GET /appointments error:', err);
      return reply.status(500).send({ error: 'Failed to fetch appointments' });
    }
  });

  app.post('/api/public/appointments', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!requirePublicScope('appointments:write', request, reply)) return;
      const orgId = (request as any).orgId as string;
      const body = request.body as Record<string, any>;

      if (!body?.contactId || !body?.appointmentDate) {
        return reply.status(400).send({ error: 'contactId and appointmentDate are required' });
      }

      const contact = await prisma.contact.findFirst({ where: { id: body.contactId, orgId }, select: { id: true } });
      if (!contact) return reply.status(404).send({ error: 'Contact not found' });

      const appointment = await prisma.appointment.create({
        data: {
          orgId,
          contactId: body.contactId,
          appointmentDate: new Date(body.appointmentDate),
          appointmentTime: body.appointmentTime,
          type: body.type,
          notes: body.notes,
        },
      });

      return reply.status(201).send(appointment);
    } catch (err) {
      logger.error('[public-api] POST /appointments error:', err);
      return reply.status(500).send({ error: 'Failed to create appointment' });
    }
  });

  // ── Messages send (FIX S-02: rate-limit + accountSafety check) ────────────

  app.post('/api/public/messages/send', {
    config: {
      rateLimit: {
        max: 60,
        timeWindow: '1 minute',
        keyGenerator: (request: FastifyRequest) => {
          const apiKey = String(request.headers['x-api-key'] ?? '');
          return apiKey ? `public-send:${crypto.createHash('sha256').update(apiKey).digest('hex')}` : `public-send-ip:${request.ip}`;
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!requirePublicScope('messages:send', request, reply)) return;
      const orgId = (request as any).orgId as string;
      const body = request.body as Record<string, any>;

      if (!body?.zaloAccountId || !body?.threadId || !body?.content) {
        return reply.status(400).send({ error: 'zaloAccountId, threadId, and content are required' });
      }

      // Verify account belongs to org
      const account = await prisma.zaloAccount.findFirst({
        where: { id: body.zaloAccountId, orgId },
        select: { id: true, status: true, archivedAt: true },
      });
      if (!account) return reply.status(404).send({ error: 'Zalo account not found' });
      // T7b (YC2 2026-06-20): nick ĐÃ XÓA (archivedAt) → 409, trước check kết nối.
      if (account.archivedAt) {
        return reply.status(409).send({ error: 'Nick này đã bị xóa — không gửi được. Kết nối lại nick để tiếp tục.', code: 'NICK_ARCHIVED' });
      }
      if (account.status !== 'connected') {
        return reply.status(422).send({ error: 'Zalo account is not connected' });
      }

      // FIX S-02/S-07: enforce account safety and atomically reserve rate-limit before sending.
      const limits = await zaloRateLimiter.reserveSend(body.zaloAccountId);
      if (!limits.allowed) {
        return reply.status(429).send({ error: limits.reason || 'Rate limit exceeded', code: 'RATE_LIMITED' });
      }

      // Dynamically import zaloPool to avoid circular deps
      const { zaloPool } = await import('../zalo/zalo-pool.js');
      const api = zaloPool.getApi(body.zaloAccountId);
      if (!api) return reply.status(422).send({ error: 'Zalo account not active in pool' });

      const threadType = body.threadType === 'group' ? 1 : 0;
      await api.sendMessage(body.content, body.threadId, threadType);

      return { success: true };
    } catch (err) {
      logger.error('[public-api] POST /messages/send error:', err);
      return reply.status(500).send({ error: 'Failed to send message' });
    }
  });
}
