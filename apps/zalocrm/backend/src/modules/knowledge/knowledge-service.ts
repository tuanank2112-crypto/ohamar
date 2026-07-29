// SPDX-License-Identifier: AGPL-3.0-or-later
import { prisma } from '../../shared/database/prisma-client.js';
import { chunkKnowledgeText, normalizeKnowledgeText, sha256 } from './chunking.js';
import { embedText, saveChunkEmbedding } from './embedding-service.js';

export type IngestInput = {
  orgId: string; userId: string; title: string; text: string; sourceType: string;
  fileName?: string | null; mimeType?: string | null; catalogItemId?: string | null;
  validFrom?: Date | null; validUntil?: Date | null;
};

export async function ingestKnowledgeDocument(input: IngestInput, options: { deferIndex?: boolean } = {}) {
  const text = normalizeKnowledgeText(input.text);
  if (text.length < 10) throw new Error('Document contains too little text');
  const checksum = sha256(text);
  const duplicate = await prisma.knowledgeDocument.findFirst({
    where: { orgId: input.orgId, checksum, status: { not: 'archived' } },
    include: { _count: { select: { chunks: true } } },
  });
  if (duplicate) return { document: duplicate, duplicate: true };

  if (input.catalogItemId) {
    const item = await prisma.catalogItem.findFirst({ where: { id: input.catalogItemId, orgId: input.orgId }, select: { id: true } });
    if (!item) throw new Error('Catalog item not found');
  }

  const archivedDuplicate = await prisma.knowledgeDocument.findFirst({
    where: { orgId: input.orgId, checksum, status: 'archived' },
    include: { chunks: { orderBy: { position: 'asc' } } },
  });
  if (archivedDuplicate) {
    const document = await prisma.$transaction(async (tx) => {
      await tx.knowledgeChunk.updateMany({
        where: { documentId: archivedDuplicate.id, orgId: input.orgId },
        data: { status: 'draft', catalogItemId: input.catalogItemId },
      });
      return tx.knowledgeDocument.update({
        where: { id: archivedDuplicate.id },
        data: {
          title: input.title.trim(),
          sourceType: input.sourceType,
          fileName: input.fileName,
          mimeType: input.mimeType,
          catalogItemId: input.catalogItemId,
          uploadedById: input.userId,
          status: 'processing',
          errorMessage: null,
          approvedById: null,
          approvedAt: null,
          validFrom: input.validFrom,
          validUntil: input.validUntil,
        },
        include: { chunks: { orderBy: { position: 'asc' } } },
      });
    });
    if (options.deferIndex) return { document, duplicate: false };
    try {
      return { document: await processKnowledgeIndex(input.orgId, document.id), duplicate: false };
    } catch (error) {
      const failed = await prisma.knowledgeDocument.findUnique({
        where: { id: document.id },
        include: { _count: { select: { chunks: true } } },
      });
      return { document: failed ?? document, duplicate: false, indexError: (error as Error).message };
    }
  }

  const chunks = chunkKnowledgeText(text);
  const document = await prisma.knowledgeDocument.create({
    data: {
      orgId: input.orgId, title: input.title.trim(), rawText: text, checksum,
      sourceType: input.sourceType, fileName: input.fileName, mimeType: input.mimeType,
      catalogItemId: input.catalogItemId, uploadedById: input.userId, status: 'processing',
      validFrom: input.validFrom, validUntil: input.validUntil,
      chunks: { create: chunks.map((chunk) => ({ ...chunk, orgId: input.orgId, catalogItemId: input.catalogItemId })) },
    },
    include: { chunks: { orderBy: { position: 'asc' } } },
  });

  if (options.deferIndex) return { document, duplicate: false };
  try {
    return { document: await processKnowledgeIndex(input.orgId, document.id), duplicate: false };
  } catch (error) {
    const failed = await prisma.knowledgeDocument.findUnique({
      where: { id: document.id },
      include: { _count: { select: { chunks: true } } },
    });
    return { document: failed ?? document, duplicate: false, indexError: (error as Error).message };
  }
}

export async function processKnowledgeIndex(orgId: string, documentId: string) {
  const document = await prisma.knowledgeDocument.findFirst({ where: { id: documentId, orgId }, include: { chunks: { orderBy: { position: 'asc' } } } });
  if (!document) throw new Error('Knowledge document not found');
  try {
    for (const chunk of document.chunks) {
      const embedding = await embedText(orgId, chunk.content, 'RETRIEVAL_DOCUMENT');
      await saveChunkEmbedding(chunk.id, orgId, embedding);
    }
    const ready = await prisma.knowledgeDocument.update({ where: { id: document.id }, data: { status: 'ready', errorMessage: null }, include: { _count: { select: { chunks: true } } } });
    return ready;
  } catch (error) {
    await prisma.knowledgeDocument.update({ where: { id: document.id }, data: { status: 'failed', errorMessage: (error as Error).message.slice(0, 4000) } });
    throw error;
  }
}

export async function reindexKnowledgeDocument(orgId: string, documentId: string) {
  const document = await prisma.knowledgeDocument.findFirst({ where: { id: documentId, orgId }, include: { chunks: { orderBy: { position: 'asc' } } } });
  if (!document) throw new Error('Knowledge document not found');
  await prisma.knowledgeDocument.update({ where: { id: document.id }, data: { status: 'processing', errorMessage: null } });
  try {
    for (const chunk of document.chunks) {
      await saveChunkEmbedding(chunk.id, orgId, await embedText(orgId, chunk.content, 'RETRIEVAL_DOCUMENT'));
    }
    return prisma.knowledgeDocument.update({ where: { id: document.id }, data: { status: 'ready' }, include: { _count: { select: { chunks: true } } } });
  } catch (error) {
    await prisma.knowledgeDocument.update({ where: { id: document.id }, data: { status: 'failed', errorMessage: (error as Error).message.slice(0, 4000) } });
    throw error;
  }
}
