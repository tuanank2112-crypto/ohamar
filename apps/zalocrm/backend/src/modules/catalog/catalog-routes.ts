// SPDX-License-Identifier: AGPL-3.0-or-later
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';
import { authMiddleware } from '../auth/auth-middleware.js';
import { prisma } from '../../shared/database/prisma-client.js';

function requireAdmin(request: FastifyRequest, reply: FastifyReply): boolean {
  if (!['owner', 'admin'].includes(request.user!.role)) {
    void reply.status(403).send({ error: 'Admin permission required' });
    return false;
  }
  return true;
}

type CatalogBody = {
  sku?: string; name?: string; description?: string | null; price?: number | string | null;
  currency?: string; status?: string; metadata?: Record<string, unknown>;
};

function clean(body: CatalogBody, partial = false) {
  const data: Record<string, unknown> = {};
  if (!partial || body.sku !== undefined) data.sku = body.sku?.trim().toUpperCase();
  if (!partial || body.name !== undefined) data.name = body.name?.trim();
  if (body.description !== undefined) data.description = body.description?.trim() || null;
  if (body.price !== undefined) data.price = body.price == null || body.price === '' ? null : new Prisma.Decimal(body.price);
  if (body.currency !== undefined) data.currency = body.currency.trim().toUpperCase();
  if (body.status !== undefined) data.status = body.status;
  if (body.metadata !== undefined) data.metadata = body.metadata as Prisma.InputJsonValue;
  return data;
}

export async function catalogRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/catalog', async (request) => {
    const query = request.query as { search?: string; status?: string; page?: string; limit?: string };
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 50));
    const where: Prisma.CatalogItemWhereInput = {
      orgId: request.user!.orgId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { OR: [
        { sku: { contains: query.search, mode: 'insensitive' } },
        { name: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ] } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.catalogItem.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { _count: { select: { knowledgeDocuments: true } } },
      }),
      prisma.catalogItem.count({ where }),
    ]);
    return { items, total, page, limit };
  });

  app.get<{ Params: { id: string } }>('/api/v1/catalog/:id', async (request, reply) => {
    const item = await prisma.catalogItem.findFirst({ where: { id: request.params.id, orgId: request.user!.orgId } });
    return item ?? reply.status(404).send({ error: 'Catalog item not found' });
  });

  app.post<{ Body: CatalogBody }>('/api/v1/catalog', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const data = clean(request.body ?? {});
    if (!data.sku || !data.name) return reply.status(400).send({ error: 'sku and name are required' });
    return reply.status(201).send(await prisma.catalogItem.create({ data: { ...data, orgId: request.user!.orgId } as Prisma.CatalogItemUncheckedCreateInput }));
  });

  app.patch<{ Params: { id: string }; Body: CatalogBody }>('/api/v1/catalog/:id', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const existing = await prisma.catalogItem.findFirst({ where: { id: request.params.id, orgId: request.user!.orgId }, select: { id: true } });
    if (!existing) return reply.status(404).send({ error: 'Catalog item not found' });
    return prisma.catalogItem.update({ where: { id: existing.id }, data: clean(request.body ?? {}, true) });
  });

  app.delete<{ Params: { id: string } }>('/api/v1/catalog/:id', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const existing = await prisma.catalogItem.findFirst({ where: { id: request.params.id, orgId: request.user!.orgId }, select: { id: true } });
    if (!existing) return reply.status(404).send({ error: 'Catalog item not found' });
    await prisma.catalogItem.update({ where: { id: existing.id }, data: { status: 'archived' } });
    return reply.status(204).send();
  });
}
