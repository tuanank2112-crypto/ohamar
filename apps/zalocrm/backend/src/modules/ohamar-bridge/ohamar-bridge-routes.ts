/**
 * Ohamar Bridge proxy — Phase 1
 * CRM UI/API calls these routes; they forward to Ohamar Bridge service.
 * Zalo I/O stays on Ohamar (zaloclaw). Do not open CRM zca-js for same nicks.
 *
 * Env: OHAMAR_BRIDGE_URL=http://host.docker.internal:18794
 *      OHAMAR_BRIDGE_TOKEN= (optional)
 */
import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { ingestOhamarEvent, ingestTokenOk, provisionOhamarAccounts } from './ohamar-ingest.js';
import { prisma } from '../../shared/database/prisma-client.js';

const BRIDGE_URL = (process.env.OHAMAR_BRIDGE_URL || '').replace(/\/$/, '');
const BRIDGE_TOKEN = (process.env.OHAMAR_BRIDGE_TOKEN || '').trim();

function bridgeEnabled(): boolean {
  return Boolean(BRIDGE_URL);
}

async function bridgeFetch(path: string, init?: RequestInit): Promise<{ status: number; json: any }> {
  if (!BRIDGE_URL) {
    return { status: 503, json: { error: 'OHAMAR_BRIDGE_URL not configured' } };
  }
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (BRIDGE_TOKEN) headers.Authorization = `Bearer ${BRIDGE_TOKEN}`;
  if (init?.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  try {
    const r = await fetch(`${BRIDGE_URL}${path}`, { ...init, headers });
    const text = await r.text();
    let json: any = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }
    return { status: r.status, json };
  } catch (e) {
    return {
      status: 502,
      json: { error: `bridge unreachable: ${e instanceof Error ? e.message : String(e)}` },
    };
  }
}

export async function ohamarBridgeRoutes(app: FastifyInstance): Promise<void> {
  // Public enough for health widget (still optional auth for bots/send)
  app.get('/api/v1/ohamar/status', async () => {
    if (!bridgeEnabled()) {
      return {
        enabled: false,
        message: 'Set OHAMAR_BRIDGE_URL to enable Ohamar bridge (phase 1)',
      };
    }
    const health = await bridgeFetch('/v1/health');
    const bots = await bridgeFetch('/v1/bots');
    return {
      enabled: true,
      bridge_url: BRIDGE_URL.replace(/\/\/.*@/, '//'), // no secrets in URL display
      health: health.json,
      bots: bots.json,
    };
  });

  // Ingest server-to-server từ lead-core (bảo vệ bằng OHAMAR_FEED_TOKEN)
  app.post('/api/v1/ohamar/ingest', async (request, reply) => {
    if (!ingestTokenOk(request.headers.authorization)) {
      return reply.status(401).send({ error: 'unauthorized' });
    }
    try {
      const result = await ingestOhamarEvent(request.body as any);
      return reply.status(200).send({ ok: true, result });
    } catch (e) {
      return reply.status(500).send({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // AI gate: bot hỏi TRƯỚC khi auto-reply. allow=false khi sale đã "Tiếp quản"
  // (handoffStatus=TAKEN) hoặc aiMode=OFF. Fail-open khi thiếu account/conversation.
  app.get('/api/v1/ohamar/ai-gate', async (request, reply) => {
    if (!ingestTokenOk(request.headers.authorization)) {
      return reply.status(401).send({ error: 'unauthorized' });
    }
    const q = request.query as Record<string, string>;
    const account = (q.account || '').trim();            // 'ohamar:main' | 'ohamar:worker'
    const thread = (q.thread || q.thread_id || '').trim();
    if (!account || !thread) {
      return reply.status(400).send({ error: 'account and thread required' });
    }
    const acc = await prisma.zaloAccount.findUnique({
      where: { zaloUid: account },
      select: { id: true },
    });
    if (!acc) return reply.send({ allow: true, reason: 'no_account' });

    const conv = await prisma.conversation.findUnique({
      where: { zaloAccountId_externalThreadId: { zaloAccountId: acc.id, externalThreadId: thread } },
      select: { aiMode: true, handoffStatus: true },
    });
    if (!conv) return reply.send({ allow: true, reason: 'no_conversation' });

    const paused = conv.handoffStatus === 'TAKEN' || conv.aiMode === 'OFF';
    return reply.send({ allow: !paused, aiMode: conv.aiMode, handoffStatus: conv.handoffStatus });
  });

  // Tạo 2 nick ảo (chạy 1 lần)
  app.post('/api/v1/ohamar/provision-accounts', async (request, reply) => {
    if (!ingestTokenOk(request.headers.authorization)) {
      return reply.status(401).send({ error: 'unauthorized' });
    }
    const result = await provisionOhamarAccounts((request.body as any) ?? {});
    return reply.send(result);
  });

  app.register(async (authed) => {
    authed.addHook('preHandler', authMiddleware);

    authed.get('/api/v1/ohamar/bots', async (_request, reply) => {
      if (!bridgeEnabled()) {
        return reply.status(503).send({ error: 'OHAMAR_BRIDGE_URL not configured' });
      }
      const r = await bridgeFetch('/v1/bots');
      return reply.status(r.status).send(r.json);
    });

    authed.post('/api/v1/ohamar/send', async (request, reply) => {
      if (!bridgeEnabled()) {
        return reply.status(503).send({ error: 'OHAMAR_BRIDGE_URL not configured' });
      }
      const r = await bridgeFetch('/v1/send', {
        method: 'POST',
        body: JSON.stringify(request.body ?? {}),
      });
      return reply.status(r.status).send(r.json);
    });

    authed.get('/api/v1/ohamar/ai-mode', async (request, reply) => {
      if (!bridgeEnabled()) {
        return reply.status(503).send({ error: 'OHAMAR_BRIDGE_URL not configured' });
      }
      const q = request.query as Record<string, string>;
      const qs = new URLSearchParams();
      if (q.bot) qs.set('bot', q.bot);
      if (q.thread_id) qs.set('thread_id', q.thread_id);
      const r = await bridgeFetch(`/v1/ai-mode?${qs}`);
      return reply.status(r.status).send(r.json);
    });

    authed.post('/api/v1/ohamar/ai-mode', async (request, reply) => {
      if (!bridgeEnabled()) {
        return reply.status(503).send({ error: 'OHAMAR_BRIDGE_URL not configured' });
      }
      const r = await bridgeFetch('/v1/ai-mode', {
        method: 'POST',
        body: JSON.stringify(request.body ?? {}),
      });
      return reply.status(r.status).send(r.json);
    });

    authed.get('/api/v1/ohamar/events', async (_request, reply) => {
      if (!bridgeEnabled()) {
        return reply.status(503).send({ error: 'OHAMAR_BRIDGE_URL not configured' });
      }
      const r = await bridgeFetch('/v1/events');
      return reply.status(r.status).send(r.json);
    });
  });
}
