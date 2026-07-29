// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * webhook-settings-routes.ts — Manage webhook URL/secret and public API key generation.
 * All routes require JWT auth and are scoped to user's org.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireGrant } from '../rbac/rbac-middleware.js';
import { logger } from '../../shared/utils/logger.js';
import { emitWebhook } from './webhook-service.js';
import crypto from 'node:crypto';

const DEFAULT_PUBLIC_API_SCOPES = [
  'contacts:read',
  'contacts:write',
  'conversations:read',
  'appointments:read',
  'appointments:write',
  'messages:send',
] as const;

function normalizeScopes(scopes: unknown): string[] {
  if (!Array.isArray(scopes) || scopes.length === 0) return [...DEFAULT_PUBLIC_API_SCOPES];
  const allowed = new Set<string>([...DEFAULT_PUBLIC_API_SCOPES, '*']);
  return [...new Set(scopes.filter((s): s is string => typeof s === 'string' && allowed.has(s)))];
}

export async function webhookSettingsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // GET /api/v1/settings/webhook — retrieve current webhook config
  app.get('/api/v1/settings/webhook', { preHandler: requireGrant('webhook', 'access') }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { orgId } = request.user!;

      const [urlSetting, secretSetting] = await Promise.all([
        prisma.appSetting.findFirst({ where: { orgId, settingKey: 'webhook_url' } }),
        prisma.appSetting.findFirst({ where: { orgId, settingKey: 'webhook_secret' } }),
      ]);

      return {
        url: urlSetting?.valuePlain ?? null,
        // Mask secret — show only last 4 chars
        secret: secretSetting?.valuePlain
          ? `${'*'.repeat(Math.max(0, secretSetting.valuePlain.length - 4))}${secretSetting.valuePlain.slice(-4)}`
          : null,
      };
    } catch (err) {
      logger.error('[webhook-settings] GET error:', err);
      return reply.status(500).send({ error: 'Failed to fetch webhook settings' });
    }
  });

  // PUT /api/v1/settings/webhook — save webhook URL and secret
  app.put('/api/v1/settings/webhook', { preHandler: requireGrant('webhook', 'edit') }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { orgId } = request.user!;
      const { url, secret } = request.body as { url?: string; secret?: string };

      await Promise.all([
        upsertSetting(orgId, 'webhook_url', url ?? ''),
        secret !== undefined ? upsertSetting(orgId, 'webhook_secret', secret) : Promise.resolve(),
      ]);

      return { success: true };
    } catch (err) {
      logger.error('[webhook-settings] PUT error:', err);
      return reply.status(500).send({ error: 'Failed to save webhook settings' });
    }
  });

  // POST /api/v1/settings/webhook/test — deliver a test event to configured URL
  app.post('/api/v1/settings/webhook/test', { preHandler: requireGrant('webhook', 'edit') }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { orgId } = request.user!;

      const config = await prisma.appSetting.findFirst({ where: { orgId, settingKey: 'webhook_url' } });
      if (!config?.valuePlain) {
        return reply.status(400).send({ error: 'No webhook URL configured' });
      }

      await emitWebhook(orgId, 'webhook.test', { message: 'Test event from CRM', orgId });
      return { success: true, sentTo: config.valuePlain };
    } catch (err) {
      logger.error('[webhook-settings] Test error:', err);
      return reply.status(500).send({ error: 'Failed to send test webhook' });
    }
  });

  // POST /api/v1/settings/api-key/generate — generate new scoped public API key
  // FIX S-01/S-14 (2026-07-07): store sha256 hash in public_api_keys, return plaintext only once.
  app.post('/api/v1/settings/api-key/generate', { preHandler: requireGrant('webhook', 'create') }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { orgId } = request.user!;
      const body = (request.body ?? {}) as { name?: string; scopes?: unknown; expiresAt?: string | null };

      const newKey = `zcrm_${crypto.randomBytes(24).toString('hex')}`;
      const keyHash = crypto.createHash('sha256').update(newKey).digest('hex');
      const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
      if (expiresAt && Number.isNaN(expiresAt.getTime())) {
        return reply.status(400).send({ error: 'expiresAt không hợp lệ' });
      }

      const apiKey = await prisma.publicApiKey.create({
        data: {
          orgId,
          name: body.name?.trim() || null,
          keyHash,
          keyPrefix: `${newKey.slice(0, 9)}…${newKey.slice(-4)}`,
          scopes: normalizeScopes(body.scopes),
          expiresAt,
        },
        select: { id: true, keyPrefix: true, scopes: true, expiresAt: true, createdAt: true, name: true },
      });

      // Remove legacy plaintext key if it exists (migration cleanup)
      try {
        await prisma.appSetting.deleteMany({
          where: { orgId, settingKey: { in: ['public_api_key', 'public_api_key_hash'] } },
        });
      } catch { /* ignore if doesn't exist */ }

      return { key: newKey, apiKey, warning: 'Lưu ý: key chỉ hiện 1 lần duy nhất. Hãy copy ngay.' };
    } catch (err) {
      logger.error('[webhook-settings] Generate API key error:', err);
      return reply.status(500).send({ error: 'Failed to generate API key' });
    }
  });

  // GET /api/v1/settings/api-key — list active public API keys
  // FIX S-01/S-14 (2026-07-07): no plaintext, supports multiple keys/scopes/expiry/revoke.
  app.get('/api/v1/settings/api-key', { preHandler: requireGrant('webhook', 'access') }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { orgId } = request.user!;

      const keys = await prisma.publicApiKey.findMany({
        where: { orgId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          keyPrefix: true,
          scopes: true,
          expiresAt: true,
          revokedAt: true,
          lastUsedAt: true,
          createdAt: true,
        },
      });

      const legacySetting = await prisma.appSetting.findFirst({
        where: { orgId, settingKey: { in: ['public_api_key', 'public_api_key_hash'] } },
        select: { id: true },
      });

      return {
        key: keys[0]?.keyPrefix ?? (legacySetting ? 'zcrm_****…**** (legacy)' : null),
        hasKey: keys.some((k) => !k.revokedAt) || !!legacySetting,
        keys,
      };
    } catch (err) {
      logger.error('[webhook-settings] GET API key error:', err);
      return reply.status(500).send({ error: 'Failed to fetch API key' });
    }
  });

  app.delete('/api/v1/settings/api-key/:id', { preHandler: requireGrant('webhook', 'edit') }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { orgId } = request.user!;
      const { id } = request.params as { id: string };
      const result = await prisma.publicApiKey.updateMany({
        where: { id, orgId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (result.count === 0) return reply.status(404).send({ error: 'API key không tồn tại hoặc đã bị thu hồi' });
      return { success: true };
    } catch (err) {
      logger.error('[webhook-settings] Revoke API key error:', err);
      return reply.status(500).send({ error: 'Failed to revoke API key' });
    }
  });
}

// ── Helper ────────────────────────────────────────────────────────────────────

async function upsertSetting(orgId: string, settingKey: string, value: string): Promise<void> {
  await prisma.appSetting.upsert({
    where: { orgId_settingKey: { orgId, settingKey } },
    create: { orgId, settingKey, valuePlain: value },
    update: { valuePlain: value },
  });
}
