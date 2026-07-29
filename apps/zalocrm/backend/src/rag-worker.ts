// SPDX-License-Identifier: AGPL-3.0-or-later
import { logger } from './shared/utils/logger.js';
import { prisma } from './shared/database/prisma-client.js';
import { startRagWorker, stopRagWorker } from './modules/ai/rag-job-queue.js';

if (!process.env.REDIS_URL) throw new Error('REDIS_URL is required for rag-worker');
startRagWorker();
logger.info('RAG/import worker started');
async function shutdown(signal: string) {
  logger.info(`RAG worker shutting down (${signal})`);
  await stopRagWorker();
  await prisma.$disconnect();
  process.exit(0);
}
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
