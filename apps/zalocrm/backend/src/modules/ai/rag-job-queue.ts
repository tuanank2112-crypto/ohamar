// SPDX-License-Identifier: AGPL-3.0-or-later
import { Queue, Worker, type ConnectionOptions, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { logger } from '../../shared/utils/logger.js';
import { processKnowledgeIndex } from '../knowledge/knowledge-service.js';
import { withTenant } from '../../shared/tenant/tenant-context.js';

export const RAG_QUEUE = 'rag-v2';
type RagJob =
  | { kind: 'decision'; orgId: string; conversationId: string; inboundMessageId?: string; query: string; contentType: string }
  | { kind: 'knowledge-index'; orgId: string; documentId: string };

let producerConnection: Redis | null = null;
let queue: Queue<RagJob> | null = null;
let worker: Worker<RagJob> | null = null;
let workerConnection: Redis | null = null;

export function hasRagQueue(): boolean { return Boolean(process.env.REDIS_URL); }

function connection(): Redis {
  if (!producerConnection) producerConnection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: null, enableReadyCheck: false });
  return producerConnection;
}
function getQueue(): Queue<RagJob> {
  if (!queue) queue = new Queue<RagJob>(RAG_QUEUE, { connection: connection() as ConnectionOptions, defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: { age: 86400, count: 5000 }, removeOnFail: { age: 604800 } } });
  return queue;
}

export async function enqueueRagDecision(data: Omit<Extract<RagJob, { kind: 'decision' }>, 'kind'>) {
  await getQueue().add('decision', { kind: 'decision', ...data }, { jobId: data.inboundMessageId ? `rag-${data.inboundMessageId}` : undefined });
}
export async function enqueueKnowledgeIndex(orgId: string, documentId: string) {
  await getQueue().add('knowledge-index', { kind: 'knowledge-index', orgId, documentId }, { jobId: `knowledge-${documentId}` });
}

export async function getRagQueueCounts() {
  if (!hasRagQueue()) return { waiting: 0, active: 0, delayed: 0, failed: 0 };
  return getQueue().getJobCounts('waiting', 'active', 'delayed', 'failed');
}

export function startRagWorker() {
  if (worker) return worker;
  workerConnection = connection().duplicate();
  worker = new Worker<RagJob>(RAG_QUEUE, async (job: Job<RagJob>) => {
    return withTenant(job.data.orgId, async () => {
      if (job.data.kind === 'knowledge-index') return processKnowledgeIndex(job.data.orgId, job.data.documentId);
      logger.warn(`[rag-worker] skipped decision job ${job.id}; auto-reply runs in app process`);
      return { skipped: true, reason: 'decision_jobs_run_in_app_process' };
    });
  }, { connection: workerConnection as ConnectionOptions, concurrency: Number(process.env.RAG_WORKER_CONCURRENCY || 4) });
  worker.on('completed', (job) => logger.info(`[rag-worker] completed ${job.name}:${job.id}`));
  worker.on('failed', (job, error) => logger.error(`[rag-worker] failed ${job?.name}:${job?.id}: ${error.message}`));
  return worker;
}

export async function stopRagWorker() {
  await worker?.close(); worker = null;
  await workerConnection?.quit(); workerConnection = null;
  await queue?.close(); queue = null;
  await producerConnection?.quit(); producerConnection = null;
}
