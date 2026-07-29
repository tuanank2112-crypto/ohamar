import { describe, expect, it, vi, beforeEach } from 'vitest';

const prismaMock = {
  knowledgeDocument: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    findUnique: vi.fn(),
  },
  knowledgeChunk: {
    updateMany: vi.fn(),
  },
  catalogItem: {
    findFirst: vi.fn(),
  },
  $transaction: vi.fn(async (fn: any) => fn({
    knowledgeDocument: prismaMock.knowledgeDocument,
    knowledgeChunk: prismaMock.knowledgeChunk,
  })),
};

vi.mock('../src/shared/database/prisma-client.js', () => ({ prisma: prismaMock }));
vi.mock('../src/modules/knowledge/embedding-service.js', () => ({
  embedText: vi.fn(),
  saveChunkEmbedding: vi.fn(),
}));

const { ingestKnowledgeDocument } = await import('../src/modules/knowledge/knowledge-service.js');

describe('knowledge-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('restores archived duplicate instead of creating a row with same checksum/version', async () => {
    const archived = { id: 'doc-1', status: 'archived', chunks: [{ id: 'chunk-1', position: 0 }] };
    const restored = { ...archived, title: 'Catalog A', status: 'processing' };
    prismaMock.knowledgeDocument.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(archived);
    prismaMock.knowledgeDocument.update.mockResolvedValue(restored);

    const result = await ingestKnowledgeDocument({
      orgId: 'org-1',
      userId: 'user-1',
      title: 'Catalog A',
      text: 'Thông tin sản phẩm đủ dài để tạo tài liệu tri thức.',
      sourceType: 'pdf',
      fileName: 'catalog.pdf',
      mimeType: 'application/pdf',
    }, { deferIndex: true });

    expect(result).toEqual({ document: restored, duplicate: false });
    expect(prismaMock.knowledgeDocument.create).not.toHaveBeenCalled();
    expect(prismaMock.knowledgeChunk.updateMany).toHaveBeenCalledWith({
      where: { documentId: 'doc-1', orgId: 'org-1' },
      data: { status: 'draft', catalogItemId: undefined },
    });
    expect(prismaMock.knowledgeDocument.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'doc-1' },
      data: expect.objectContaining({ status: 'processing', errorMessage: null, approvedById: null, approvedAt: null }),
    }));
  });
});
