// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * credential-routes.ts — Export/import Zalo session credentials for backup/restore.
 * Endpoints: GET /accounts/:id/credentials/export, POST /accounts/:id/credentials/import
 * Credentials contain sensitive cookies — access restricted to account admins.
 */
import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import bcrypt from 'bcryptjs';
import { config } from '../../config/index.js';
import { decryptZaloSession, encryptedSessionUpdate, isValidZaloCredentials } from './session-credentials.js';
import { logActivity } from '../activity/activity-logger.js';

/** Shape matching openzca StoredCredentials */
const BASE = '/api/v1/zalo-accounts/:accountId/credentials';

export async function credentialRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  // GET .../credentials/export — download session credentials as JSON
  app.get(`${BASE}/export`, async (request, reply) => {
    const { accountId } = request.params as { accountId: string };
    const user = request.user!;

    if (!config.allowZaloCredentialExport) {
      return reply.status(404).send({ error: 'Credential export is disabled' });
    }
    if (user.role !== 'owner') {
      return reply.status(403).send({ error: 'Organization owner permission required' });
    }
    const reauthPassword = request.headers['x-reauth-password'];
    if (typeof reauthPassword !== 'string' || !reauthPassword) {
      return reply.status(401).send({ error: 'Re-authentication required', code: 'reauth_required' });
    }
    const owner = await prisma.user.findFirst({ where: { id: user.id, orgId: user.orgId }, select: { passwordHash: true } });
    if (!owner || !(await bcrypt.compare(reauthPassword, owner.passwordHash))) {
      logActivity({ orgId: user.orgId, userId: user.id, action: 'zalo_credentials_export_denied', entityType: 'zalo_account', entityId: accountId });
      return reply.status(401).send({ error: 'Re-authentication failed', code: 'reauth_failed' });
    }

    const account = await prisma.zaloAccount.findFirst({
      where: { id: accountId, orgId: user.orgId },
      select: { id: true, sessionData: true, sessionCiphertext: true, displayName: true },
    });
    if (!account) {
      return reply.status(404).send({ error: 'Account not found' });
    }

    const credentials = decryptZaloSession(account);
    if (!credentials) {
      return reply.status(404).send({ error: 'No credentials saved for this account' });
    }

    const filename = `zalo-credentials-${account.displayName ?? accountId}-${Date.now()}.json`;
    reply.header('Content-Type', 'application/json');
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    logger.info(`[credential-routes] Exporting credentials for account ${accountId}`);
    logActivity({ orgId: user.orgId, userId: user.id, action: 'zalo_credentials_exported', entityType: 'zalo_account', entityId: accountId });
    return reply.send(JSON.stringify(credentials, null, 2));
  });

  // POST .../credentials/import — restore credentials from uploaded JSON
  app.post<{ Body: unknown }>(`${BASE}/import`, async (request, reply) => {
    const { accountId } = request.params as { accountId: string };
    const user = request.user!;

    const account = await prisma.zaloAccount.findFirst({
      where: { id: accountId, orgId: user.orgId },
      select: { id: true },
    });
    if (!account) {
      return reply.status(404).send({ error: 'Account not found' });
    }

    // Only owner/admin or explicit admin permission on account
    if (!['owner', 'admin'].includes(user.role)) {
      const access = await prisma.zaloAccountAccess.findFirst({
        where: { zaloAccountId: accountId, userId: user.id },
      });
      if (!access || access.permission !== 'admin') {
        return reply.status(403).send({ error: 'Admin permission required to import credentials' });
      }
    }

    const body = request.body;
    if (!isValidZaloCredentials(body)) {
      return reply.status(400).send({
        error: 'Invalid credential format. Expected: { cookie: object, imei: string, userAgent: string }',
      });
    }

    try {
      await prisma.zaloAccount.update({
        where: { id: accountId },
        data: {
          ...encryptedSessionUpdate(body),
          status: 'disconnected',
        },
      });

      logger.info(`[credential-routes] Credentials imported for account ${accountId}`);
      logActivity({ orgId: user.orgId, userId: user.id, action: 'zalo_credentials_imported', entityType: 'zalo_account', entityId: accountId });
      return { success: true, message: 'Credentials imported. Use reconnect to activate.' };
    } catch (err) {
      logger.error(`[credential-routes] Import failed for account ${accountId}:`, err);
      return reply.status(500).send({ error: 'Failed to save credentials' });
    }
  });
}
