#!/usr/bin/env node
/**
 * Lead Core HTTP API — bind localhost + bearer token.
 */
import http from "node:http";
import { HOST, PORT, TOKEN } from "./config.mjs";
import { migrate } from "./db.mjs";
import {
  authorizeOutbound,
  appendConsent,
  claimOwnership,
  closeConversation,
  createHandoff,
  getConversation,
  ingestEvent,
  listWatchSnapshots,
  metrics,
  upsertWatchSnapshot,
} from "./handlers.mjs";

migrate();

if (!TOKEN || TOKEN.length < 16) {
  console.error(
    "❌ LEAD_CORE_TOKEN missing or too short (set in services/lead-core/.env, min 16 chars)",
  );
  process.exit(1);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error("invalid JSON"), { status: 400 }));
      }
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
    if (!auth(req)) {
      return send(res, 401, { error: "unauthorized" });
    }

    const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);
    const path = url.pathname;
    const method = req.method || "GET";

    if (method === "GET" && path === "/v1/health") {
      return send(res, 200, {
        ok: true,
        service: "lead-core",
        host: HOST,
        port: PORT,
        time: new Date().toISOString(),
      });
    }

    if (method === "GET" && path === "/v1/metrics") {
      return send(res, 200, metrics());
    }

    if (method === "POST" && path === "/v1/events") {
      const body = await readBody(req);
      return send(res, 200, ingestEvent(body));
    }

    if (method === "POST" && path === "/v1/handoffs") {
      const body = await readBody(req);
      return send(res, 200, createHandoff(body));
    }

    if (method === "POST" && path === "/v1/consents") {
      const body = await readBody(req);
      return send(res, 201, { consent: appendConsent(body) });
    }

    if (method === "GET" && path === "/v1/watch/snapshots") {
      return send(res, 200, { snapshots: listWatchSnapshots() });
    }

    if (method === "POST" && path === "/v1/watch/snapshots") {
      const body = await readBody(req);
      if (!body.source_url || !body.content_hash) {
        return send(res, 400, { error: "source_url and content_hash required" });
      }
      return send(
        res,
        200,
        upsertWatchSnapshot(body.source_url, body.content_hash, body.excerpt),
      );
    }

    const convMatch = /^\/v1\/conversations\/([^/]+)(?:\/(claim|outbound|close))?$/.exec(
      path,
    );
    if (convMatch) {
      const id = decodeURIComponent(convMatch[1]);
      const action = convMatch[2];

      if (method === "GET" && !action) {
        const c = getConversation(id);
        if (!c) return send(res, 404, { error: "not found" });
        return send(res, 200, { conversation: c });
      }

      if (method === "POST" && action === "claim") {
        const body = await readBody(req);
        return send(res, 200, { conversation: claimOwnership(id, body) });
      }

      if (method === "POST" && action === "outbound") {
        const body = await readBody(req);
        return send(res, 200, authorizeOutbound(id, body));
      }

      if (method === "POST" && action === "close") {
        const body = await readBody(req);
        return send(res, 200, { conversation: closeConversation(id, body) });
      }
    }

    send(res, 404, { error: "not found", path });
  } catch (err) {
    const status = err.status || 500;
    send(res, status, {
      error: err.message || String(err),
      status,
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`🦞 Lead Core listening http://${HOST}:${PORT}`);
  console.log(`   auth: Bearer token required (except GET /v1/health)`);
  console.log(`   db:   see LEAD_CORE_DB`);
});
