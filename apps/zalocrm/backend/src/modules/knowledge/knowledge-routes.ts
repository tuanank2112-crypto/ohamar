// SPDX-License-Identifier: AGPL-3.0-or-later
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { detectDocumentType, extractDocumentText } from './document-extractor.js';
import { ingestKnowledgeDocument, reindexKnowledgeDocument } from './knowledge-service.js';
import { searchApprovedChunks } from './embedding-service.js';
import { enqueueKnowledgeIndex, hasRagQueue } from '../ai/rag-job-queue.js';
import { scanOrPass } from '../../shared/security/clamav-client.js';

function admin(request: FastifyRequest, reply: FastifyReply): boolean {
  if (!['owner', 'admin'].includes(request.user!.role)) { void reply.status(403).send({ error: 'Admin permission required' }); return false; }
  return true;
}

function date(value: unknown): Date | null {
  if (!value) return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid date: ${String(value)}`);
  return parsed;
}

export async function knowledgeRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/knowledge/documents', async (request) => {
    const query = request.query as { status?: string; search?: string };
    return prisma.knowledgeDocument.findMany({
      where: { orgId: request.user!.orgId, ...(query.status ? { status: query.status } : {}), ...(query.search ? { title: { contains: query.search, mode: 'insensitive' as const } } : {}) },
      include: { catalogItem: { select: { id: true, sku: true, name: true } }, _count: { select: { chunks: true } }, uploadedBy: { select: { id: true, fullName: true } } },
      orderBy: { updatedAt: 'desc' },
    });
  });

  app.get<{ Params: { id: string } }>('/api/v1/knowledge/documents/:id', async (request, reply) => {
    const document = await prisma.knowledgeDocument.findFirst({
      where: { id: request.params.id, orgId: request.user!.orgId },
      include: { chunks: { orderBy: { position: 'asc' }, select: { id: true, position: true, content: true, tokenCount: true, status: true } }, catalogItem: true },
    });
    return document ?? reply.status(404).send({ error: 'Knowledge document not found' });
  });

  app.post<{ Body: { title?: string; text?: string; catalogItemId?: string; validFrom?: string; validUntil?: string } }>('/api/v1/knowledge/documents', async (request, reply) => {
    if (!admin(request, reply)) return;
    const body = request.body ?? {};
    if (!body.title?.trim() || !body.text?.trim()) return reply.status(400).send({ error: 'title and text are required' });
    const deferred = hasRagQueue();
    const result = await ingestKnowledgeDocument({ orgId: request.user!.orgId, userId: request.user!.id, title: body.title, text: body.text, sourceType: 'manual', catalogItemId: body.catalogItemId, validFrom: date(body.validFrom), validUntil: date(body.validUntil) }, { deferIndex: deferred });
    if (deferred && !result.duplicate) await enqueueKnowledgeIndex(request.user!.orgId, result.document.id);
    return reply.status(result.duplicate ? 200 : deferred ? 202 : 201).send(result);
  });

  app.post('/api/v1/knowledge/documents/upload', async (request, reply) => {
    if (!admin(request, reply)) return;
    const file = await request.file({ limits: { fileSize: 20 * 1024 * 1024, files: 1 } });
    if (!file) return reply.status(400).send({ error: 'file is required' });
    const buffer = await file.toBuffer();
    const av = await scanOrPass(buffer, { filename: file.filename, userId: request.user!.id });
    if (av.blocked) return reply.status(422).send({ error: av.reason, code: 'AV_BLOCKED' });
    const type = detectDocumentType(file.filename, file.mimetype, buffer);
    const text = await extractDocumentText(type, buffer);
    const fields = file.fields as Record<string, { value?: unknown }>;
    const title = String(fields.title?.value || file.filename).trim();
    const deferred = hasRagQueue();
    const result = await ingestKnowledgeDocument({
      orgId: request.user!.orgId, userId: request.user!.id, title, text, sourceType: type,
      fileName: file.filename, mimeType: file.mimetype,
      catalogItemId: fields.catalogItemId?.value ? String(fields.catalogItemId.value) : null,
      validFrom: date(fields.validFrom?.value), validUntil: date(fields.validUntil?.value),
    }, { deferIndex: deferred });
    if (deferred && !result.duplicate) await enqueueKnowledgeIndex(request.user!.orgId, result.document.id);
    return reply.status(result.duplicate ? 200 : deferred ? 202 : 201).send(result);
  });

  app.post<{ Params: { id: string } }>('/api/v1/knowledge/documents/:id/approve', async (request, reply) => {
    if (!admin(request, reply)) return;
    const document = await prisma.knowledgeDocument.findFirst({ where: { id: request.params.id, orgId: request.user!.orgId }, select: { id: true, status: true } });
    if (!document) return reply.status(404).send({ error: 'Knowledge document not found' });
    if (!['ready', 'approved'].includes(document.status)) return reply.status(409).send({ error: 'Only successfully indexed documents can be approved' });
    const result = await prisma.$transaction(async (tx) => {
      await tx.knowledgeChunk.updateMany({ where: { documentId: document.id, orgId: request.user!.orgId }, data: { status: 'approved' } });
      return tx.knowledgeDocument.update({ where: { id: document.id }, data: { status: 'approved', approvedById: request.user!.id, approvedAt: new Date() } });
    });
    (app as any).io?.to(`org:${request.user!.orgId}`).emit('knowledge:job', { documentId: document.id, status: 'approved' });
    return result;
  });

  app.post<{ Params: { id: string } }>('/api/v1/knowledge/documents/:id/archive', async (request, reply) => {
    if (!admin(request, reply)) return;
    const document = await prisma.knowledgeDocument.findFirst({ where: { id: request.params.id, orgId: request.user!.orgId }, select: { id: true } });
    if (!document) return reply.status(404).send({ error: 'Knowledge document not found' });
    await prisma.$transaction([
      prisma.knowledgeChunk.updateMany({ where: { documentId: document.id, orgId: request.user!.orgId }, data: { status: 'archived' } }),
      prisma.knowledgeDocument.update({ where: { id: document.id }, data: { status: 'archived' } }),
    ]);
    return { success: true };
  });

  app.post<{ Params: { id: string } }>('/api/v1/knowledge/documents/:id/re-index', async (request, reply) => {
    if (!admin(request, reply)) return;
    return reindexKnowledgeDocument(request.user!.orgId, request.params.id);
  });

  app.post<{ Body: { query?: string; topK?: number } }>('/api/v1/knowledge/search-test', async (request, reply) => {
    const query = request.body?.query?.trim();
    if (!query) return reply.status(400).send({ error: 'query is required' });
    const config = await prisma.aiConfig.findUnique({ where: { orgId: request.user!.orgId }, select: { ragTopK: true, ragSimilarityThreshold: true } });
    const chunks = await searchApprovedChunks(request.user!.orgId, query, request.body.topK ?? config?.ragTopK ?? 5);
    return { query, threshold: config?.ragSimilarityThreshold ?? 0.78, chunks };
  });
}
