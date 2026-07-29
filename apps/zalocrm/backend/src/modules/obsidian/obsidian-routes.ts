// SPDX-License-Identifier: AGPL-3.0-or-later
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { authMiddleware } from '../auth/auth-middleware.js';
import { getObsidianStatus, syncApprovedObsidianNotes } from './obsidian-service.js';

function admin(request: FastifyRequest, reply: FastifyReply): boolean {
  if (!['owner', 'admin'].includes(request.user!.role)) {
    void reply.status(403).send({ error: 'Admin permission required' });
    return false;
  }
  return true;
}

export async function obsidianRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/obsidian/status', async () => getObsidianStatus());

  app.post<{ Body: { dryRun?: boolean } }>('/api/v1/obsidian/sync', async (request, reply) => {
    if (!admin(request, reply)) return;
    try {
      return await syncApprovedObsidianNotes(request.user!.orgId, request.user!.id, { dryRun: request.body?.dryRun });
    } catch (error) {
      return reply.status(409).send({ error: (error as Error).message });
    }
  });
}

