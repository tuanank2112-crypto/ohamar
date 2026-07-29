// SPDX-License-Identifier: AGPL-3.0-or-later
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { config } from '../../config/index.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { resolveProviderApiKey } from '../ai/provider-registry.js';

export type EmbeddingTask = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';

async function metadataAccessToken(): Promise<string> {
  if (config.googleCloudAccessToken) return config.googleCloudAccessToken;
  const response = await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', {
    headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(2000),
  });
  if (!response.ok) throw new Error(`GCP metadata token failed: HTTP ${response.status}`);
  const data = await response.json() as { access_token?: string };
  if (!data.access_token) throw new Error('GCP metadata token response is invalid');
  return data.access_token;
}

function localEmbedding(text: string): number[] {
  const values = new Array<number>(768).fill(0);
  const words = text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  for (const word of words) {
    const digest = createHash('sha256').update(word).digest();
    const index = digest.readUInt16BE(0) % values.length;
    values[index] += digest[2] % 2 ? 1 : -1;
  }
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0)) || 1;
  return values.map((value) => value / norm);
}

function validate(values: unknown): number[] {
  if (!Array.isArray(values) || values.length !== 768 || values.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
    throw new Error('Embedding provider must return exactly 768 finite numbers');
  }
  return values as number[];
}

export async function embedText(orgId: string, text: string, task: EmbeddingTask): Promise<number[]> {
  if (config.vertexProjectId) {
    const token = await metadataAccessToken();
    const endpoint = `https://${config.vertexLocation}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(config.vertexProjectId)}/locations/${encodeURIComponent(config.vertexLocation)}/publishers/google/models/${encodeURIComponent(config.vertexEmbeddingModel)}:predict`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ instances: [{ content: text, task_type: task }], parameters: { outputDimensionality: 768 } }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Vertex embedding failed: HTTP ${response.status} ${await response.text()}`);
    const data = await response.json() as { predictions?: Array<{ embeddings?: { values?: unknown } }> };
    return validate(data.predictions?.[0]?.embeddings?.values);
  }

  const apiKey = await resolveProviderApiKey(orgId, 'gemini');
  if (apiKey) {
    const endpoint = `${config.geminiBaseUrl.replace(/\/$/, '')}/v1beta/models/${encodeURIComponent(config.vertexEmbeddingModel)}:embedContent?key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: `models/${config.vertexEmbeddingModel}`, content: { parts: [{ text }] }, taskType: task, outputDimensionality: 768 }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Gemini embedding failed: HTTP ${response.status} ${await response.text()}`);
    const data = await response.json() as { embedding?: { values?: unknown } };
    return validate(data.embedding?.values);
  }

  if (config.nodeEnv === 'test' || config.ragAllowLocalEmbeddings) return localEmbedding(text);
  throw new Error('No Vertex/Gemini embedding credentials configured');
}

function vectorLiteral(values: number[]): string {
  return `[${values.join(',')}]`;
}

export async function saveChunkEmbedding(chunkId: string, orgId: string, values: number[]): Promise<void> {
  const vector = vectorLiteral(validate(values));
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "knowledge_chunks" SET "embedding" = ${vector}::vector, "updated_at" = NOW()
    WHERE "id" = ${chunkId} AND "org_id" = ${orgId}
  `);
}

export type RetrievedChunk = { id: string; documentId: string; title: string; content: string; similarity: number; position: number };

export async function searchApprovedChunks(orgId: string, query: string, topK: number): Promise<RetrievedChunk[]> {
  const embedding = await embedText(orgId, query, 'RETRIEVAL_QUERY');
  const vector = vectorLiteral(embedding);
  return prisma.$queryRaw<RetrievedChunk[]>(Prisma.sql`
    SELECT c."id", c."document_id" AS "documentId", d."title", c."content", c."position",
           (1 - (c."embedding" <=> ${vector}::vector))::double precision AS "similarity"
    FROM "knowledge_chunks" c
    JOIN "knowledge_documents" d ON d."id" = c."document_id" AND d."org_id" = c."org_id"
    WHERE c."org_id" = ${orgId}
      AND c."status" = 'approved' AND d."status" = 'approved'
      AND c."embedding" IS NOT NULL
      AND (d."valid_from" IS NULL OR d."valid_from" <= NOW())
      AND (d."valid_until" IS NULL OR d."valid_until" > NOW())
    ORDER BY c."embedding" <=> ${vector}::vector
    LIMIT ${Math.min(20, Math.max(1, topK))}
  `);
}
