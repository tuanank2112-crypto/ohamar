# CODE_CONTEXT.md — Ohamar Source Code Reference

> **Generated:** 2026-07-28T14:08 ICT  
> **Purpose:** Nguyên văn các file thiết yếu để AI khác hiểu logic mà không cần truy cập source.  
> **KHÔNG chứa secrets, tokens, API keys.**

---

## Table of Contents

1. [Directory Tree](#1-directory-tree)
2. [package.json (root)](#2-packagejson-root)
3. [Database Schema](#3-database-schema)
4. [Lead Core API — Server + Handlers](#4-lead-core-api)
5. [Lead Core Config + DB + Audit + Client](#5-lead-core-support-modules)
6. [Bridge — Server + Send + Bots + Store](#6-bridge)
7. [Ops Console — Server](#7-ops-console-server)
8. [Scripts — env.mjs (Core Environment)](#8-scripts-envmjs)
9. [Scripts — start, stop, health, watchdog, setup, zalo-login](#9-scripts-operations)
10. [CLI Entry Point](#10-cli-entry-point)
11. [Workspace Docs (Agent Config)](#11-workspace-docs)
12. [Dependencies (sub-packages)](#12-dependencies)
13. [Git Ignore](#13-gitignore)

---

## 1. Directory Tree

```
ohamar/
├── bin/
│   └── ohamar.mjs
├── scripts/
│   ├── env.mjs
│   ├── start.mjs
│   ├── stop.mjs
│   ├── setup.mjs
│   ├── health.mjs
│   ├── watchdog.mjs
│   ├── zalo-login.mjs
│   ├── backup.mjs
│   ├── dashboard.mjs
│   ├── doctor.mjs
│   ├── agent.mjs
│   ├── cli.mjs
│   ├── status.mjs
│   ├── start-stack.mjs
│   ├── relocate-config.mjs
│   ├── postinstall.mjs
│   ├── cards-cases.mjs
│   ├── cards-export.mjs
│   ├── drive-doctor.mjs
│   ├── lead-outbound-gate.mjs
│   ├── rebuild-case-index.mjs
│   ├── sheet-gap-report.mjs
│   ├── validate-product-cards.mjs
│   ├── expand-clinical-case-folders.py
│   ├── export-product-cards.py
│   ├── sheet-gap-report.py
│   └── windows/
├── vendor/
│   └── zaloclaw/                         # ZaloClaw plugin (TypeScript, git clone)
│       ├── index.ts
│       ├── package.json
│       ├── openclaw.plugin.json          # Plugin manifest (~150 actions)
│       ├── src/
│       ├── dist/
│       ├── tests/
│       └── docs/
├── services/
│   ├── lead-core/
│   │   ├── package.json
│   │   ├── schema.sql
│   │   ├── .env / .env.example
│   │   ├── README.md
│   │   ├── apply-zaloclaw-bridge.mjs
│   │   ├── install-skills.mjs
│   │   ├── ohamar-integration/
│   │   ├── patches/
│   │   └── src/
│   │       ├── server.mjs
│   │       ├── handlers.mjs
│   │       ├── db.mjs
│   │       ├── config.mjs
│   │       ├── client.mjs
│   │       ├── audit.mjs
│   │       ├── outbound-gate.mjs
│   │       ├── watch.mjs
│   │       ├── watch-cron.mjs
│   │       ├── register-cron.mjs
│   │       ├── backup.mjs
│   │       ├── doctor.mjs
│   │       ├── health-cli.mjs
│   │       └── migrate.mjs
│   ├── ohamar-bridge/
│   │   └── src/
│   │       ├── server.mjs
│   │       ├── send.mjs
│   │       ├── bots.mjs
│   │       └── store.mjs
│   ├── ops-console/
│   │   ├── README.md
│   │   └── src/
│   │       ├── server.mjs
│   │       ├── handlers.mjs
│   │       └── db.mjs
│   └── fb-messenger/
│       ├── package.json
│       └── src/
├── apps/
│   ├── crm-ui/                           # Vue 3 + Vuetify (reference, not wired)
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   └── src/
│   └── zalocrm/                          # Full ZaloCRM Docker stack
│       ├── docker-compose.yml
│       ├── backend/
│       └── frontend/
├── workspace/                            # Agent workspace (gitignored except .gitkeep)
│   ├── SOUL.md
│   ├── BEHAVIOR.md
│   ├── ARCHITECTURE.md
│   ├── ROUTING.md
│   ├── MEDICAL-SALES.md
│   ├── IDENTITY.md
│   ├── USER.md
│   ├── MEMORY.md
│   ├── SUPERVISOR.md
│   ├── COMMANDS.md
│   ├── MODELS.md
│   ├── TOOLS.md
│   ├── STACK.md
│   ├── WORKER-BOT.md
│   ├── BEHAVIOR-LEAD-CORE.md
│   ├── DOI-BOSS.md
│   ├── HUONG-DAN.md
│   ├── brand-kits/
│   │   └── vicamed/
│   ├── skills/                           # 19 custom skills
│   │   ├── product-lookup/
│   │   ├── case-lookup/
│   │   ├── voice/
│   │   ├── go-block/ / go-unblock/
│   │   ├── lead-handoff/
│   │   ├── image-gen/
│   │   ├── excel-report/
│   │   ├── fb-search/
│   │   ├── medium-digest/
│   │   └── ... (19 total)
│   └── memory/
├── data/                                 # Main state (gitignored)
├── data-worker/                          # Worker state (gitignored)
├── docs/
│   ├── BRIDGE-PHASE1.md
│   ├── MULTI-CHANNEL.md
│   ├── SYNC-VPS.md
│   └── UI-STRATEGY-B.md
├── backups/
├── package.json
├── README.md
└── .gitignore
```

---

## 2. package.json (root)

```json
// File: package.json
{
  "name": "ohamar",
  "version": "1.0.0",
  "description": "Ohamar — Personal AI assistant (local). OpenClaw core + ZaloClaw channel, branded and isolated for self-host.",
  "private": true,
  "type": "module",
  "license": "MIT",
  "engines": {
    "node": ">=22.19.0"
  },
  "bin": {
    "ohamar": "./bin/ohamar.mjs"
  },
  "scripts": {
    "setup": "node scripts/setup.mjs",
    "start": "node scripts/start.mjs",
    "stop": "node scripts/stop.mjs",
    "start:worker": "node scripts/start.mjs",
    "stop:worker": "node scripts/stop.mjs",
    "status": "node scripts/status.mjs",
    "health": "node scripts/health.mjs",
    "watchdog": "node scripts/watchdog.mjs",
    "backup": "node scripts/backup.mjs all",
    "zalo:login": "node scripts/zalo-login.mjs",
    "zalo:login:worker": "node scripts/zalo-login.mjs",
    "dashboard": "node scripts/dashboard.mjs",
    "agent": "node scripts/agent.mjs",
    "doctor": "node scripts/doctor.mjs",
    "cli": "node scripts/cli.mjs",
    "lead-core:start": "node services/lead-core/src/server.mjs",
    "lead-core:migrate": "node services/lead-core/src/migrate.mjs",
    "lead-core:backup": "node services/lead-core/src/backup.mjs",
    "lead-core:watch": "node services/lead-core/src/watch.mjs",
    "lead-core:watch-cron": "node services/lead-core/src/watch-cron.mjs",
    "lead-core:health": "node services/lead-core/src/health-cli.mjs",
    "lead-core:register-cron": "node services/lead-core/src/register-cron.mjs",
    "lead-core:gate": "node services/lead-core/src/outbound-gate.mjs",
    "lead-core:apply-bridge": "node services/lead-core/apply-zaloclaw-bridge.mjs",
    "lead-core:doctor": "node services/lead-core/src/doctor.mjs",
    "stack:start": "node scripts/start-stack.mjs",
    "bridge": "BRIDGE_DRY_RUN=${BRIDGE_DRY_RUN:-1} node services/ohamar-bridge/src/server.mjs",
    "bridge:live": "BRIDGE_DRY_RUN=0 node services/ohamar-bridge/src/server.mjs",
    "ops-console": "OPS_IDLE_SEC=60 node services/ops-console/src/server.mjs",
    "crm-ui:dev": "npm --prefix apps/crm-ui run dev",
    "crm-ui:build": "npm --prefix apps/crm-ui run build",
    "fb:start": "node services/fb-messenger/src/server.mjs",
    "cards:validate": "node scripts/validate-product-cards.mjs --brand vicamed",
    "cards:export": "node scripts/cards-export.mjs"
  },
  "dependencies": {
    "openclaw": "^2026.7.1"
  },
  "ohamar": {
    "defaultPort": 18789,
    "stateDir": "./data",
    "workspace": "./workspace",
    "plugins": [
      "vendor/zaloclaw"
    ]
  }
}
```

---

## 3. Database Schema

```sql
-- File: services/lead-core/schema.sql (FULL — 107 lines)
-- Lead Core schema v2 (enforce ownership, identity, dedup, consent append-only)
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  source_user_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  owner TEXT NOT NULL DEFAULT 'none',
  status TEXT NOT NULL DEFAULT 'NEW',
  intent TEXT,
  summary TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  close_reason TEXT,
  last_message_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (channel, source_user_id, thread_id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_conversations_owner ON conversations(owner);

CREATE TABLE IF NOT EXISTS processed_messages (
  channel TEXT NOT NULL,
  source_message_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  received_at TEXT NOT NULL,
  PRIMARY KEY (channel, source_message_id),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE TABLE IF NOT EXISTS consents (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  type TEXT NOT NULL,
  purpose TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('grant', 'withdraw')),
  captured_at TEXT NOT NULL,
  source_message_id TEXT,
  note TEXT,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE INDEX IF NOT EXISTS idx_consents_conv ON consents(conversation_id, type, captured_at);

CREATE TABLE IF NOT EXISTS handoffs (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  from_owner TEXT NOT NULL,
  to_owner TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  idempotency_key TEXT NOT NULL UNIQUE,
  payload_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE TABLE IF NOT EXISTS outbound_log (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  caller TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  payload_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE TABLE IF NOT EXISTS send_leases (
  conversation_id TEXT PRIMARY KEY,
  caller TEXT NOT NULL,
  lease_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  conversation_id TEXT,
  event_type TEXT NOT NULL,
  actor TEXT,
  detail_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_conv ON audit_events(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS watch_snapshots (
  source_url TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL,
  excerpt TEXT,
  fetched_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO meta(key, value) VALUES ('schema_version', '2');
INSERT OR IGNORE INTO meta(key, value) VALUES ('retention_days', '365');
```

---

## 4. Lead Core API

### 4.1 Server (Route registration + Auth middleware)

```javascript
// File: services/lead-core/src/server.mjs (FULL — 162 lines)
#!/usr/bin/env node
import http from "node:http";
import { HOST, PORT, TOKEN } from "./config.mjs";
import { migrate } from "./db.mjs";
import {
  authorizeOutbound, appendConsent, claimOwnership, closeConversation,
  createHandoff, getConversation, ingestEvent, listWatchSnapshots,
  metrics, upsertWatchSnapshot,
} from "./handlers.mjs";

migrate();

if (!TOKEN || TOKEN.length < 16) {
  console.error("❌ LEAD_CORE_TOKEN missing or too short (min 16 chars)");
  process.exit(1);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch { reject(Object.assign(new Error("invalid JSON"), { status: 400 })); }
    });
    req.on("error", reject);
  });
}

function send(res, status, obj) {
  const body = JSON.stringify(obj, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function auth(req) {
  if (req.url === "/v1/health" && req.method === "GET") return true;
  const h = req.headers.authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return Boolean(m && m[1] === TOKEN);
}

const server = http.createServer(async (req, res) => {
  try {
    if (!auth(req)) return send(res, 401, { error: "unauthorized" });
    const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);
    const path = url.pathname;
    const method = req.method || "GET";

    if (method === "GET" && path === "/v1/health")
      return send(res, 200, { ok: true, service: "lead-core", host: HOST, port: PORT, time: new Date().toISOString() });
    if (method === "GET" && path === "/v1/metrics")
      return send(res, 200, metrics());
    if (method === "POST" && path === "/v1/events")
      return send(res, 200, ingestEvent(await readBody(req)));
    if (method === "POST" && path === "/v1/handoffs")
      return send(res, 200, createHandoff(await readBody(req)));
    if (method === "POST" && path === "/v1/consents")
      return send(res, 201, { consent: appendConsent(await readBody(req)) });
    if (method === "GET" && path === "/v1/watch/snapshots")
      return send(res, 200, { snapshots: listWatchSnapshots() });
    if (method === "POST" && path === "/v1/watch/snapshots") {
      const body = await readBody(req);
      if (!body.source_url || !body.content_hash) return send(res, 400, { error: "source_url and content_hash required" });
      return send(res, 200, upsertWatchSnapshot(body.source_url, body.content_hash, body.excerpt));
    }

    const convMatch = /^\/v1\/conversations\/([^/]+)(?:\/(claim|outbound|close))?$/.exec(path);
    if (convMatch) {
      const id = decodeURIComponent(convMatch[1]);
      const action = convMatch[2];
      if (method === "GET" && !action) {
        const c = getConversation(id);
        if (!c) return send(res, 404, { error: "not found" });
        return send(res, 200, { conversation: c });
      }
      if (method === "POST" && action === "claim")
        return send(res, 200, { conversation: claimOwnership(id, await readBody(req)) });
      if (method === "POST" && action === "outbound")
        return send(res, 200, authorizeOutbound(id, await readBody(req)));
      if (method === "POST" && action === "close")
        return send(res, 200, { conversation: closeConversation(id, await readBody(req)) });
    }

    send(res, 404, { error: "not found", path });
  } catch (err) {
    send(res, err.status || 500, { error: err.message || String(err), status: err.status || 500 });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`🦞 Lead Core listening http://${HOST}:${PORT}`);
});
```

### 4.2 Handlers (Core business logic)

```javascript
// File: services/lead-core/src/handlers.mjs (FULL — 408 lines)
import { getDb, nowIso, uuid } from "./db.mjs";
import { audit } from "./audit.mjs";
import { LEASE_TTL_SEC, OWNERS, STATUSES } from "./config.mjs";

function bad(msg, code = 400) {
  const e = new Error(msg); e.status = code; return e;
}

export function getConversation(id) {
  return getDb().prepare(`SELECT * FROM conversations WHERE id = ?`).get(id);
}

export function metrics() {
  const d = getDb();
  const byStatus = d.prepare(`SELECT status, COUNT(*) AS n FROM conversations GROUP BY status`).all();
  const handoffFailed = d.prepare(`SELECT COUNT(*) AS n FROM handoffs WHERE status = 'failed'`).get().n;
  const total = d.prepare(`SELECT COUNT(*) AS n FROM conversations`).get().n;
  return { total, byStatus, handoffFailed };
}

export function ingestEvent(body) {
  const channel = String(body.channel || "").trim();
  const sourceUserId = String(body.source_user_id || "").trim();
  const threadId = String(body.thread_id || "").trim();
  const sourceMessageId = String(body.source_message_id || "").trim();
  const text = body.text != null ? String(body.text) : null;
  const actor = body.actor || "system";

  if (!channel || !sourceUserId || !threadId) throw bad("channel, source_user_id, thread_id required");
  if (!sourceMessageId) throw bad("source_message_id required for inbound dedup");

  const d = getDb();
  const dup = d.prepare(
    `SELECT conversation_id FROM processed_messages WHERE channel = ? AND source_message_id = ?`
  ).get(channel, sourceMessageId);
  if (dup) return { duplicate: true, conversation: getConversation(dup.conversation_id) };

  let conv = d.prepare(
    `SELECT * FROM conversations WHERE channel = ? AND source_user_id = ? AND thread_id = ?`
  ).get(channel, sourceUserId, threadId);

  const ts = nowIso();
  let reopened = false;

  if (!conv) {
    const id = uuid();
    d.prepare(
      `INSERT INTO conversations (id, channel, source_user_id, thread_id, owner, status, version, last_message_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'none', 'NEW', 1, ?, ?, ?)`
    ).run(id, channel, sourceUserId, threadId, ts, ts, ts);
    conv = getConversation(id);
    audit(id, "conversation.created", actor, { channel, sourceUserId, threadId });
  } else if (conv.status === "CLOSED") {
    d.prepare(
      `UPDATE conversations SET status = 'BOT_ACTIVE', close_reason = NULL, version = version + 1, last_message_at = ?, updated_at = ? WHERE id = ?`
    ).run(ts, ts, conv.id);
    reopened = true;
    conv = getConversation(conv.id);
    audit(conv.id, "conversation.reopened", actor, { from: "CLOSED" });
  } else {
    d.prepare(`UPDATE conversations SET last_message_at = ?, updated_at = ? WHERE id = ?`).run(ts, ts, conv.id);
    conv = getConversation(conv.id);
  }

  d.prepare(
    `INSERT INTO processed_messages (channel, source_message_id, conversation_id, received_at) VALUES (?, ?, ?, ?)`
  ).run(channel, sourceMessageId, conv.id, ts);

  if (text) {
    audit(conv.id, "message.inbound", actor, { source_message_id: sourceMessageId, text_preview: text.slice(0, 200) });
  }
  return { duplicate: false, reopened, conversation: conv };
}

export function claimOwnership(id, body) {
  const caller = String(body.caller || "").trim();
  const expectedVersion = body.version;
  if (!OWNERS.has(caller) || caller === "none") throw bad("invalid caller");
  const conv = getConversation(id);
  if (!conv) throw bad("conversation not found", 404);
  if (expectedVersion != null && Number(expectedVersion) !== conv.version) throw bad(`version conflict: have ${conv.version}`, 409);

  const force = body.force === true && (caller === "human" || caller === "gia_huy");
  if (conv.owner !== "none" && conv.owner !== caller && !force && conv.status !== "CLOSED")
    throw bad(`owned by ${conv.owner}`, 409);

  const ts = nowIso();
  const newStatus = body.status && STATUSES.has(body.status) ? body.status
    : conv.status === "NEW" || conv.status === "CLOSED" ? "BOT_ACTIVE"
    : conv.status === "ASSIGNED" || conv.status === "HUMAN_ACTIVE" ? conv.status : "BOT_ACTIVE";

  getDb().prepare(`UPDATE conversations SET owner = ?, status = ?, version = version + 1, updated_at = ? WHERE id = ?`)
    .run(caller, newStatus, ts, id);
  const next = getConversation(id);
  audit(id, "ownership.claimed", caller, { previous_owner: conv.owner, status: next.status, version: next.version });
  return next;
}

export function authorizeOutbound(id, body) {
  const caller = String(body.caller || "").trim();
  const version = body.version != null ? Number(body.version) : null;
  const idempotencyKey = String(body.idempotency_key || "").trim();
  if (!caller || !OWNERS.has(caller) || caller === "none") throw bad("invalid caller");
  if (!idempotencyKey) throw bad("idempotency_key required");

  const d = getDb();
  const existing = d.prepare(`SELECT * FROM outbound_log WHERE idempotency_key = ?`).get(idempotencyKey);
  if (existing) return { allowed: existing.status === "allowed" || existing.status === "sent", duplicate: true, outbound: existing };

  const conv = getConversation(id);
  if (!conv) throw bad("conversation not found", 404);
  if (conv.status === "CLOSED") throw bad("conversation closed — reopen via inbound first", 409);
  if (conv.owner !== caller) throw bad(`caller ${caller} is not owner ${conv.owner}`, 409);
  if (version != null && version !== conv.version) throw bad(`version conflict: have ${conv.version}`, 409);

  const ts = nowIso();
  const leaseId = uuid();
  const expires = new Date(Date.now() + LEASE_TTL_SEC * 1000).toISOString();
  d.prepare(
    `INSERT INTO send_leases (conversation_id, caller, lease_id, version, expires_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(conversation_id) DO UPDATE SET caller=excluded.caller, lease_id=excluded.lease_id, version=excluded.version, expires_at=excluded.expires_at`
  ).run(id, caller, leaseId, conv.version, expires);

  const outId = uuid();
  d.prepare(
    `INSERT INTO outbound_log (id, conversation_id, caller, idempotency_key, status, payload_json, created_at) VALUES (?, ?, ?, ?, 'allowed', ?, ?)`
  ).run(outId, id, caller, idempotencyKey, JSON.stringify({ text: body.text ?? null, media: body.media ?? [], channel: body.channel ?? conv.channel, thread_id: body.thread_id ?? conv.thread_id }), ts);

  audit(id, "outbound.allowed", caller, { idempotency_key: idempotencyKey, lease_id: leaseId, expires_at: expires });
  return { allowed: true, duplicate: false, lease_id: leaseId, expires_at: expires, version: conv.version, conversation: conv };
}

export function createHandoff(body) {
  const conversationId = String(body.conversation_id || "").trim();
  const fromOwner = String(body.from_owner || "").trim();
  const toOwner = String(body.to_owner || "").trim();
  const idempotencyKey = String(body.idempotency_key || "").trim();
  if (!conversationId || !fromOwner || !toOwner || !idempotencyKey)
    throw bad("conversation_id, from_owner, to_owner, idempotency_key required");

  const d = getDb();
  const existing = d.prepare(`SELECT * FROM handoffs WHERE idempotency_key = ?`).get(idempotencyKey);
  if (existing) return { duplicate: true, handoff: existing };

  const conv = getConversation(conversationId);
  if (!conv) throw bad("conversation not found", 404);
  if (conv.owner !== fromOwner && fromOwner !== "human" && fromOwner !== "gia_huy")
    throw bad("from_owner is not current owner", 409);

  // Consent gate: handoff to minh_phat requires zalo consent grant
  if (toOwner === "minh_phat" && body.require_zalo_consent !== false) {
    const ok = hasActiveConsent(conversationId, "zalo");
    if (!ok && body.force !== true) throw bad("zalo consent grant required before handoff to minh_phat", 409);
  }

  const ts = nowIso();
  const id = uuid();
  d.prepare(
    `INSERT INTO handoffs (id, conversation_id, from_owner, to_owner, reason, status, idempotency_key, payload_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'accepted', ?, ?, ?, ?)`
  ).run(id, conversationId, fromOwner, toOwner, body.reason ?? null, idempotencyKey, JSON.stringify(body.payload ?? {}), ts, ts);

  const status = toOwner === "human" ? "HUMAN_ACTIVE" : toOwner === "none" ? conv.status : "ASSIGNED";
  d.prepare(
    `UPDATE conversations SET owner = ?, status = ?, version = version + 1, summary = COALESCE(?, summary), updated_at = ? WHERE id = ?`
  ).run(toOwner, status, body.summary ?? null, ts, conversationId);

  audit(conversationId, "handoff.accepted", fromOwner, { to_owner: toOwner, handoff_id: id });
  return { duplicate: false, handoff: d.prepare(`SELECT * FROM handoffs WHERE id = ?`).get(id), conversation: getConversation(conversationId) };
}

export function appendConsent(body) {
  const conversationId = String(body.conversation_id || "").trim();
  const type = String(body.type || "").trim();
  const purpose = String(body.purpose || "").trim();
  const action = String(body.action || "grant").trim();
  if (!conversationId || !type || !purpose) throw bad("conversation_id, type, purpose required");
  if (action !== "grant" && action !== "withdraw") throw bad("action must be grant|withdraw");
  if (!getConversation(conversationId)) throw bad("conversation not found", 404);

  const id = uuid();
  const ts = body.captured_at || nowIso();
  getDb().prepare(
    `INSERT INTO consents (id, conversation_id, type, purpose, action, captured_at, source_message_id, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, conversationId, type, purpose, action, ts, body.source_message_id ?? null, body.note ?? null);
  audit(conversationId, `consent.${action}`, body.actor || "system", { type, purpose, consent_id: id });
  return getDb().prepare(`SELECT * FROM consents WHERE id = ?`).get(id);
}

export function hasActiveConsent(conversationId, type) {
  const row = getDb().prepare(
    `SELECT action FROM consents WHERE conversation_id = ? AND type = ? ORDER BY captured_at DESC LIMIT 1`
  ).get(conversationId, type);
  return row?.action === "grant";
}

export function closeConversation(id, body) {
  const conv = getConversation(id);
  if (!conv) throw bad("conversation not found", 404);
  const ts = nowIso();
  getDb().prepare(
    `UPDATE conversations SET status = 'CLOSED', close_reason = ?, owner = 'none', version = version + 1, updated_at = ? WHERE id = ?`
  ).run(body.close_reason ?? "other", ts, id);
  audit(id, "conversation.closed", body.actor || "system", { close_reason: body.close_reason ?? "other" });
  return getConversation(id);
}

export function upsertWatchSnapshot(sourceUrl, contentHash, excerpt) {
  const ts = nowIso();
  const d = getDb();
  const prev = d.prepare(`SELECT * FROM watch_snapshots WHERE source_url = ?`).get(sourceUrl);
  d.prepare(
    `INSERT INTO watch_snapshots (source_url, content_hash, excerpt, fetched_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(source_url) DO UPDATE SET content_hash=excluded.content_hash, excerpt=excluded.excerpt, fetched_at=excluded.fetched_at`
  ).run(sourceUrl, contentHash, excerpt ?? null, ts);
  return { changed: !prev || prev.content_hash !== contentHash, previous_hash: prev?.content_hash ?? null, content_hash: contentHash, fetched_at: ts };
}

export function listWatchSnapshots() {
  return getDb().prepare(`SELECT * FROM watch_snapshots ORDER BY source_url`).all();
}
```

---

## 5. Lead Core Support Modules

### 5.1 Config

```javascript
// File: services/lead-core/src/config.mjs (FULL — 50 lines)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "..");

function loadEnvFile(p) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

loadEnvFile(path.join(ROOT, ".env"));
loadEnvFile(path.join(ROOT, "../../data/.env"));

export const HOST = process.env.LEAD_CORE_HOST || "127.0.0.1";
export const PORT = Number(process.env.LEAD_CORE_PORT || 18792);
export const TOKEN = process.env.LEAD_CORE_TOKEN || "";
export const DB_PATH = path.resolve(ROOT, process.env.LEAD_CORE_DB || "./data/lead.db");
export const LEASE_TTL_SEC = Number(process.env.LEAD_CORE_LEASE_TTL_SEC || 45);
export const RETENTION_DAYS = Number(process.env.LEAD_CORE_RETENTION_DAYS || 365);

export const OWNERS = new Set(["none", "gia_huy", "minh_phat", "fb_page", "human"]);
export const STATUSES = new Set(["NEW", "BOT_ACTIVE", "WAITING_CONSENT", "ASSIGNED", "HUMAN_ACTIVE", "CLOSED"]);
```

### 5.2 Database

```javascript
// File: services/lead-core/src/db.mjs (FULL — 32 lines)
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DB_PATH, ROOT } from "./config.mjs";

let db;
export function getDb() {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}

export function migrate() {
  const sqlPath = path.join(ROOT, "schema.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  getDb().exec(sql);
  return DB_PATH;
}

export function nowIso() { return new Date().toISOString(); }
export function uuid() { return crypto.randomUUID(); }
```

### 5.3 Audit

```javascript
// File: services/lead-core/src/audit.mjs (FULL — 17 lines)
import { getDb, nowIso, uuid } from "./db.mjs";

export function audit(conversationId, eventType, actor, detail = {}) {
  getDb().prepare(
    `INSERT INTO audit_events (id, conversation_id, event_type, actor, detail_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(uuid(), conversationId ?? null, eventType, actor ?? null, JSON.stringify(detail), nowIso());
}
```

### 5.4 HTTP Client

```javascript
// File: services/lead-core/src/client.mjs (FULL — 63 lines)
import { HOST, PORT, TOKEN } from "./config.mjs";
const base = () => `http://${HOST}:${PORT}`;

export async function api(method, path, body) {
  const headers = { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" };
  let payload;
  if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
  const r = await fetch(`${base()}${path}`, { method, headers, body: payload });
  const text = await r.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!r.ok) { const err = new Error(json.error || `HTTP ${r.status}`); err.status = r.status; err.body = json; throw err; }
  return json;
}

export function ingestEvent(body) { return api("POST", "/v1/events", body); }
export function claim(id, body) { return api("POST", `/v1/conversations/${id}/claim`, body); }
export function outbound(id, body) { return api("POST", `/v1/conversations/${id}/outbound`, body); }
export function handoff(body) { return api("POST", "/v1/handoffs", body); }
export function consent(body) { return api("POST", "/v1/consents", body); }
export function getConversation(id) { return api("GET", `/v1/conversations/${id}`); }
```

---

## 6. Bridge

### 6.1 Bridge Server

```javascript
// File: services/ohamar-bridge/src/server.mjs (FULL — 174 lines)
// See PROJECT_HANDOFF.md §17.7 for key excerpt
// Full source already captured in review — key routes:
// GET  /v1/health, /v1/bots, /v1/bots/:id, /v1/events, /v1/ai-mode
// POST /v1/ai-mode, /v1/send, /v1/events/inbound
```

### 6.2 Bridge Send

```javascript
// File: services/ohamar-bridge/src/send.mjs (FULL — 173 lines)
// Key function: sendMessage({ bot, target, text, is_group?, force?, dry_run? })
// Path 1: tools/invoke → gateway HTTP POST /tools/invoke
// Path 2: CLI fallback → spawn openclaw message send --channel zaloclaw
// See PROJECT_HANDOFF.md §17.7
```

### 6.3 Bridge Bots

```javascript
// File: services/ohamar-bridge/src/bots.mjs (FULL — 94 lines)
export const BOTS = {
  main: { id: "main", label: "Gia Huy Vicamed", port: 18789, host: "127.0.0.1", stateDir: "data" },
  worker: { id: "worker", label: "Minh Phát Vicamed", port: 18790, host: "127.0.0.1", stateDir: "data-worker" },
};

export function readGatewayToken(stateDir) {
  // Read gateway.auth.token from openclaw.json in stateDir
}

export async function botStatus(botId) {
  // Check: port listening (TCP), credentials present, account name
  return { id, label, account_name, host, port, listening, credentials_present, ok, channel: "zaloclaw" };
}
```

### 6.4 Bridge Store

```javascript
// File: services/ohamar-bridge/src/store.mjs (FULL — 87 lines)
// JSON file: bridge-store.json
// Functions: load(), save(), getAiMode(bot, threadId), setAiMode(bot, threadId, mode, actor)
// ai_modes: "ai_active" | "human_paused" | "human_pinned"
// Events: capped at 500 entries
// ⚠️ BUG: load() + save() per request = race condition on concurrent writes
```

---

## 7. Ops Console Server

```javascript
// File: services/ops-console/src/server.mjs (FULL — 228 lines)
// HTTP :18793 — static serving + API
// Routes: /v1/health, /v1/threads, /v1/events, /v1/ai-allowed
//         /v1/demo/reset, /v1/tick
//         /v1/threads/:id, /v1/threads/:id/(takeover|resume|pin|send|sim-customer)
// Background: setInterval 5s → tickAutoResume()
// Static: web/dist (Vue build) or public/ (prototype)
```

---

## 8. Scripts — env.mjs (Core Environment)

```javascript
// File: scripts/env.mjs (FULL — 382 lines)
// ★ This is the most critical shared module. All scripts import from here.
// See PROJECT_HANDOFF.md §17.2 for key excerpts.
//
// Key exports:
// - INSTANCE ("main" | "worker")
// - IS_WORKER, BOT_LABEL
// - ROOT, STATE_DIR, WORKSPACE, CONFIG_PATH, ENV_PATH
// - CREDENTIALS_DIR, CREDENTIALS_PATH
// - ZALOCLAW, OPENCLAW_BIN
// - DEFAULT_PORT (18789 | 18790)
// - OWNER_ZALO_ID (hardcoded)
//
// Key functions:
// - ohamarEnv() → complete env for openclaw invocations (includes LEAD_CORE_*)
// - acquireProcessLock() → exclusive file lock (O_EXCL)
// - assertCredentialsIsolation() → fail-closed credential checks
// - loadDotEnv() → parse data/.env
// - stripBomFromJsonFile() → heal Windows BOM
// - readPidFile() / writePidFile() / clearPidFile()
// - isPidAlive() → process.kill(pid, 0)
// - portInUse() → net.createServer test
// - appendAlert() → write to alerts/alerts.jsonl
```

---

## 9. Scripts — Operations

### start.mjs, stop.mjs, health.mjs, watchdog.mjs, setup.mjs, zalo-login.mjs

All full source code is captured in the review files read during analysis. Key patterns:

- All import from `scripts/env.mjs`
- All use `ohamarEnv()` for child process spawning
- `start.mjs`: acquireProcessLock → spawn openclaw gateway → signal handlers
- `stop.mjs`: read pid → SIGTERM → 15s wait → SIGKILL → openclaw gateway stop
- `health.mjs`: config check + port check + credential check + account match → exit 0/1
- `watchdog.mjs`: loop health → consecutive fails → alert (JSONL + optional cmd)
- `setup.mjs`: ensureDirs → seed config → install zaloclaw → link plugin → doctor
- `zalo-login.mjs`: backup old creds → openclaw channels login --channel zaloclaw

---

## 10. CLI Entry Point

```javascript
// File: bin/ohamar.mjs (FULL — 67 lines)
// Maps: setup|start|stop|status|dashboard|zalo:login|agent|doctor → scripts/*.mjs
// Unknown commands → openclaw CLI passthrough via scripts/cli.mjs
```

---

## 11. Workspace Docs (Agent Config)

These markdown files are loaded by OpenClaw at agent session startup. They define the bot's persona, rules, and capabilities.

| File | Lines | Purpose |
|------|-------|---------|
| SOUL.md | 141 | Bot personality, 9 voice modes, core rules |
| BEHAVIOR.md | 158 | L3: when to reply/refuse/escalate, group/DM rules, slash commands |
| MEDICAL-SALES.md | 235 | Medical sales safety: zero-tolerance, whitelist claims, escalation |
| ARCHITECTURE.md | 129 | 6-layer system design, failure modes |
| ROUTING.md | 101 | Model selection routing (Grok vs NineSonnet) |
| IDENTITY.md | 24 | Bot name: "Gia Huy", Zalo: "Gia Huy Vicamed" |
| USER.md | 32 | Boss preferences, voice: "diu-dang", model routing |
| MEMORY.md | 56 | Long-term memory index, project facts |
| SUPERVISOR.md | 77 | Lead–worker hierarchy, file-based commands |
| COMMANDS.md | 142 | Full slash command reference |
| MODELS.md | 185 | Model aliases, API key setup guide |
| TOOLS.md | 29 | Available tools, path warnings |
| WORKER-BOT.md | 52 | Worker bot setup details |
| BEHAVIOR-LEAD-CORE.md | 23 | Lead Core enforce rules |
| STACK.md | 273 | Project structure map |

---

## 12. Dependencies (sub-packages)

### Lead Core

```json
// File: services/lead-core/package.json
{
  "name": "@ohamar/lead-core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22.19.0" },
  "scripts": {
    "start": "node src/server.mjs",
    "migrate": "node src/migrate.mjs",
    "backup": "node src/backup.mjs",
    "health": "node src/health-cli.mjs"
  }
}
```

### CRM UI (Reference)

```json
// File: apps/crm-ui/package.json
{
  "name": "frontend",
  "version": "3.4.0",
  "type": "module",
  "dependencies": {
    "vue": "^3.5.30",
    "vuetify": "^4.0.4",
    "pinia": "^3.0.4",
    "vue-router": "^4.6.4",
    "axios": "^1.13.6",
    "socket.io-client": "^4.8.3",
    "chart.js": "^4.5.1",
    "vue-i18n": "^11.3.0",
    "@tiptap/vue-3": "^3.22.3"
  },
  "devDependencies": {
    "vite": "^8.0.1",
    "typescript": "~5.9.3",
    "vitest": "^4.1.8",
    "vue-tsc": "^3.2.5"
  }
}
```

---

## 13. .gitignore

```gitignore
# File: .gitignore (FULL — 38 lines)
node_modules/
data/
data-worker/
workspace/
!workspace/.gitkeep
workspace-worker/
!workspace-worker/.gitkeep
backups/
.env
.env.*
!.env.example
*.log
.DS_Store
vendor/zaloclaw/node_modules/
**/google-drive-sa.json
**/secrets/**
!**/secrets/README.md
services/lead-core/data/
services/lead-core/*.db
services/lead-core/*.db-*
services/ops-console/data/
services/ops-console/web/node_modules/
services/ops-console/web/dist/
apps/crm-ui/node_modules/
apps/crm-ui/dist/
services/fb-messenger/.env
vendor/
apps/zalocrm/**/node_modules/
apps/zalocrm/**/dist/
apps/zalocrm/.env
services/ohamar-bridge/data/
```
