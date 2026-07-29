// SPDX-License-Identifier: AGPL-3.0-or-later
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { commitOrderImport, createOrderPreview, parseOrderFile, type ColumnMapping, type RawRow } from './order-import-service.js';
import { scanOrPass } from '../../shared/security/clamav-client.js';

function admin(request: FastifyRequest, reply: FastifyReply): boolean {
  if (!['owner', 'admin'].includes(request.user!.role)) { void reply.status(403).send({ error: 'Admin permission required' }); return false; }
  return true;
}

export async function orderRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/orders', async (request) => {
    const query = request.query as { contactId?: string; search?: string; limit?: string };
    return prisma.order.findMany({
      where: { orgId: request.user!.orgId, ...(query.contactId ? { contactId: query.contactId } : {}), ...(query.search ? { OR: [{ externalId: { contains: query.search, mode: 'insensitive' as const } }, { customerPhone: { contains: query.search } }] } : {}) },
      include: { items: true, contact: { select: { id: true, fullName: true, crmName: true } } }, orderBy: [{ orderedAt: 'desc' }, { createdAt: 'desc' }], take: Math.min(200, Number(query.limit) || 50),
    });
  });

  app.get<{ Params: { id: string } }>('/api/v1/contacts/:id/orders/summary', async (request, reply) => {
    const contact = await prisma.contact.findFirst({ where: { id: request.params.id, orgId: request.user!.orgId }, select: { id: true } });
    if (!contact) return reply.status(404).send({ error: 'Contact not found' });
    const [aggregate, latest] = await Promise.all([
      prisma.order.aggregate({ where: { orgId: request.user!.orgId, contactId: contact.id }, _count: true, _sum: { total: true } }),
      prisma.order.findFirst({ where: { orgId: request.user!.orgId, contactId: contact.id }, orderBy: [{ orderedAt: 'desc' }, { createdAt: 'desc' }], include: { items: true } }),
    ]);
    return { orderCount: aggregate._count, totalSpend: aggregate._sum.total ?? 0, latestOrder: latest };
  });

  app.post<{ Body: { rows?: RawRow[]; mapping?: ColumnMapping; fileName?: string } }>('/api/v1/orders/imports/preview', async (request, reply) => {
    if (!admin(request, reply)) return;
    let rows: RawRow[], mapping: ColumnMapping, fileName: string | undefined;
    if (request.isMultipart()) {
      const file = await request.file({ limits: { fileSize: 20 * 1024 * 1024, files: 1 } });
      if (!file) return reply.status(400).send({ error: 'file is required' });
      fileName = file.filename;
      const buffer = await file.toBuffer();
      const av = await scanOrPass(buffer, { filename: file.filename, userId: request.user!.id });
      if (av.blocked) return reply.status(422).send({ error: av.reason, code: 'AV_BLOCKED' });
      rows = await parseOrderFile(file.filename, buffer);
      const rawMapping = (file.fields as Record<string, { value?: unknown }>).mapping?.value;
      mapping = rawMapping ? JSON.parse(String(rawMapping)) as ColumnMapping : {};
    } else {
      rows = request.body?.rows ?? [];
      mapping = request.body?.mapping ?? {};
      fileName = request.body?.fileName;
    }
    const result = await createOrderPreview({ orgId: request.user!.orgId, userId: request.user!.id, rows, mapping, fileName });
    (app as any).io?.to(`org:${request.user!.orgId}`).emit('order:import', { batchId: result.batch.id, status: 'preview' });
    return reply.status(result.duplicate ? 200 : 201).send(result);
  });

  app.post<{ Params: { id: string } }>('/api/v1/orders/imports/:id/commit', async (request, reply) => {
    if (!admin(request, reply)) return;
    const batch = await commitOrderImport(request.user!.orgId, request.params.id);
    (app as any).io?.to(`org:${request.user!.orgId}`).emit('order:import', { batchId: batch.id, status: batch.status });
    return batch;
  });

  app.get('/api/v1/orders/imports', async (request) => prisma.orderImportBatch.findMany({ where: { orgId: request.user!.orgId }, orderBy: { createdAt: 'desc' }, take: 100 }));
  app.get<{ Params: { id: string }; Querystring: { format?: string } }>('/api/v1/orders/imports/:id/errors', async (request, reply) => {
    const batch = await prisma.orderImportBatch.findFirst({ where: { id: request.params.id, orgId: request.user!.orgId }, select: { id: true, errorRows: true } });
    if (!batch) return reply.status(404).send({ error: 'Order import batch not found' });
    if (request.query.format === 'csv') {
      const errors = batch.errorRows as Array<{ row?: number; errors?: string[]; raw?: Record<string, unknown> }>;
      const quote = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
      const csv = ['row,errors,raw', ...errors.map((error) => [error.row, error.errors?.join('; '), JSON.stringify(error.raw ?? {})].map(quote).join(','))].join('\n');
      reply.header('Content-Type', 'text/csv; charset=utf-8').header('Content-Disposition', `attachment; filename="order-import-errors-${batch.id}.csv"`);
      return reply.send(`\uFEFF${csv}`);
    }
    return batch;
  });
}
