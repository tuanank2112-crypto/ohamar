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
