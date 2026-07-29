// SPDX-License-Identifier: AGPL-3.0-or-later
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { processRagDecision } from './rag-service.js';
import { getRagQueueCounts } from './rag-job-queue.js';

function admin(request: FastifyRequest, reply: FastifyReply): boolean {
  if (!['owner', 'admin'].includes(request.user!.role)) { void reply.status(403).send({ error: 'Admin permission required' }); return false; }
  return true;
}

export async function ragRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/ai/rag/config', async (request) => {
    return prisma.aiConfig.upsert({
      where: { orgId: request.user!.orgId },
      create: {
        orgId: request.user!.orgId,
        ragEnabled: true,
        ragAutoDailyBudget: 500,
        ragKillSwitch: false,
      },
      update: {},
    });
  });
  app.patch<{ Body: { ragEnabled?: boolean; ragSimilarityThreshold?: number; ragTopK?: number; ragAutoDailyBudget?: number; ragKillSwitch?: boolean } }>('/api/v1/ai/rag/config', async (request, reply) => {
    if (!admin(request, reply)) return;
    const body = request.body ?? {};
    if (body.ragSimilarityThreshold != null && (body.ragSimilarityThreshold < 0 || body.ragSimilarityThreshold > 1)) return reply.status(400).send({ error: 'ragSimilarityThreshold must be between 0 and 1' });
    if (body.ragTopK != null && (body.ragTopK < 1 || body.ragTopK > 20)) return reply.status(400).send({ error: 'ragTopK must be between 1 and 20' });
    if (body.ragAutoDailyBudget != null && body.ragAutoDailyBudget < 0) return reply.status(400).send({ error: 'ragAutoDailyBudget must be >= 0' });
    return prisma.aiConfig.upsert({
      where: { orgId: request.user!.orgId },
      create: {
        orgId: request.user!.orgId,
        ragEnabled: true,
        ragAutoDailyBudget: 500,
        ragKillSwitch: false,
        ...body,
      },
      update: body,
    });
  });

  app.get('/api/v1/ai/rag/metrics', async (request) => {
    const orgId = request.user!.orgId;
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const [groups, latency, suspendedAccounts, unsafeBlocked, citations, queue] = await Promise.all([
      prisma.aiDecision.groupBy({ by: ['decision'], where: { orgId, createdAt: { gte: start } }, _count: true }),
      prisma.aiDecision.aggregate({ where: { orgId, createdAt: { gte: start } }, _avg: { latencyMs: true } }),
      prisma.zaloAccount.count({ where: { orgId, safetyStatus: 'suspended', archivedAt: null } }),
      prisma.aiDecision.count({ where: { orgId, createdAt: { gte: start }, decision: { in: ['handoff', 'blocked'] }, NOT: { riskFlags: { equals: [] } } } }),
      prisma.knowledgeCitation.count({ where: { orgId, createdAt: { gte: start } } }),
      getRagQueueCounts(),
    ]);
    const decisions = Object.fromEntries(groups.map((group) => [group.decision, group._count]));
    return { date: start.toISOString().slice(0, 10), decisions, averageLatencyMs: Math.round(latency._avg.latencyMs ?? 0), suspendedAccounts, unsafeBlocked, citations, queue };
  });

  app.patch<{ Params: { id: string }; Body: { mode?: string } }>('/api/v1/conversations/:id/ai-mode', async (request, reply) => {
    const mode = String(request.body?.mode || '').toUpperCase();
    if (!['OFF', 'ASSIST', 'AUTO'].includes(mode)) return reply.status(400).send({ error: 'mode must be OFF, ASSIST or AUTO' });
    if (mode === 'AUTO' && !['owner', 'admin'].includes(request.user!.role)) return reply.status(403).send({ error: 'Admin permission required to enable AUTO' });
    const conversation = await prisma.conversation.findFirst({ where: { id: request.params.id, orgId: request.user!.orgId }, select: { id: true } });
    if (!conversation) return reply.status(404).send({ error: 'Conversation not found' });
    return prisma.conversation.update({ where: { id: conversation.id }, data: { aiMode: mode } });
  });

  app.patch<{ Params: { id: string }; Body: { enabled?: boolean } }>('/api/v1/zalo-accounts/:id/ai-auto', async (request, reply) => {
    if (!admin(request, reply)) return;
    if (typeof request.body?.enabled !== 'boolean') return reply.status(400).send({ error: 'enabled boolean is required' });
    const account = await prisma.zaloAccount.findFirst({ where: { id: request.params.id, orgId: request.user!.orgId }, select: { id: true } });
    if (!account) return reply.status(404).send({ error: 'Zalo account not found' });
    return prisma.zaloAccount.update({ where: { id: account.id }, data: { aiAutoEnabled: request.body.enabled }, select: { id: true, aiAutoEnabled: true } });
  });

  app.post<{ Params: { id: string }; Body: { reason?: string } }>('/api/v1/conversations/:id/handoff', async (request, reply) => {
    const conversation = await prisma.conversation.findFirst({ where: { id: request.params.id, orgId: request.user!.orgId }, select: { id: true } });
    if (!conversation) return reply.status(404).send({ error: 'Conversation not found' });
    const updated = await prisma.conversation.update({ where: { id: conversation.id }, data: { handoffStatus: 'TAKEN', handoffReason: request.body?.reason || 'human_takeover', handoffAt: new Date(), handoffById: request.user!.id } });
    (app as any).io?.to(`org:${request.user!.orgId}`).emit('conversation:handoff', { conversationId: updated.id, status: updated.handoffStatus });
    return updated;
  });

  app.post<{ Params: { id: string } }>('/api/v1/conversations/:id/resume-ai', async (request, reply) => {
    const conversation = await prisma.conversation.findFirst({ where: { id: request.params.id, orgId: request.user!.orgId }, select: { id: true } });
    if (!conversation) return reply.status(404).send({ error: 'Conversation not found' });
    const updated = await prisma.conversation.update({ where: { id: conversation.id }, data: { handoffStatus: 'NONE', handoffReason: null, handoffAt: null, handoffById: null } });
    (app as any).io?.to(`org:${request.user!.orgId}`).emit('conversation:handoff', { conversationId: updated.id, status: updated.handoffStatus });
    return updated;
  });

  app.post<{ Body: { conversationId?: string; query?: string } }>('/api/v1/ai/rag/decide', async (request, reply) => {
    if (!request.body?.conversationId || !request.body?.query?.trim()) return reply.status(400).send({ error: 'conversationId and query are required' });
    const decision = await processRagDecision({ orgId: request.user!.orgId, conversationId: request.body.conversationId, query: request.body.query, contentType: 'text' });
    (app as any).io?.to(`org:${request.user!.orgId}`).emit('ai:decision', { conversationId: request.body.conversationId, decision });
    return decision;
  });
}
