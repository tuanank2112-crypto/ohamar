#!/usr/bin/env node
/**
 * Ohamar Ops Console — AI-first sales takeover demo
 *
 *   cd services/ops-console && node src/server.mjs
 *   open http://127.0.0.1:18793
 *
 * Env:
 *   OPS_PORT=18793
 *   OPS_HOST=127.0.0.1
 *   OPS_IDLE_SEC=60          # demo default; prod ~300–600
 *   OPS_TOKEN=               # optional Bearer; empty = open (local demo)
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  aiAllowed,
  getConfig,
  getThread,
  listEvents,
  listThreads,
  pinHuman,
  resetDemo,
  resumeAi,
  sendAsBot,
  simCustomer,
  takeover,
  tickAutoResume,
} from "./handlers.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, "..", "public");
const HOST = process.env.OPS_HOST || "127.0.0.1";
const PORT = Number(process.env.OPS_PORT || 18793);
const TOKEN = (process.env.OPS_TOKEN || "").trim();

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

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  res.end(body);
}

function auth(req) {
  if (!TOKEN) return true;
  if (req.method === "OPTIONS") return true;
  // static + health open
  const u = req.url || "";
  if (u === "/" || u.startsWith("/assets") || u.startsWith("/v1/health")) return true;
  if (!u.startsWith("/v1/")) return true;
  const h = req.headers.authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return Boolean(m && m[1] === TOKEN);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

function serveStatic(res, filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const ext = path.extname(filePath);
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      return sendJson(res, 204, {});
    }
    if (!auth(req)) {
      return sendJson(res, 401, { error: "unauthorized" });
    }

    const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);
    const p = url.pathname;
    const method = req.method || "GET";

    // --- API ---
    if (method === "GET" && p === "/v1/health") {
      return sendJson(res, 200, {
        ok: true,
        service: "ops-console",
        config: getConfig(),
        time: new Date().toISOString(),
      });
    }

    if (method === "GET" && p === "/v1/threads") {
      return sendJson(res, 200, listThreads());
    }

    if (method === "GET" && p === "/v1/events") {
      return sendJson(res, 200, listEvents(80));
    }

    if (method === "GET" && p === "/v1/ai-allowed") {
      return sendJson(
        res,
        200,
        aiAllowed({
          thread_id: url.searchParams.get("thread_id"),
          bot: url.searchParams.get("bot"),
          id: url.searchParams.get("id"),
        }),
      );
    }

    if (method === "POST" && p === "/v1/demo/reset") {
      return sendJson(res, 200, resetDemo());
    }

    if (method === "POST" && p === "/v1/tick") {
      return sendJson(res, 200, tickAutoResume());
    }

    const threadMatch = /^\/v1\/threads\/([^/]+)(?:\/(takeover|resume|pin|send|sim-customer))?$/.exec(
      p,
    );
    if (threadMatch) {
      const id = decodeURIComponent(threadMatch[1]);
      const action = threadMatch[2];

      if (method === "GET" && !action) {
        return sendJson(res, 200, getThread(id));
      }

      const body = method === "POST" ? await readBody(req) : {};

      if (method === "POST" && action === "takeover") {
        return sendJson(res, 200, takeover(id, body));
      }
      if (method === "POST" && action === "resume") {
        return sendJson(res, 200, resumeAi(id, body));
      }
      if (method === "POST" && action === "pin") {
        return sendJson(res, 200, pinHuman(id, body));
      }
      if (method === "POST" && action === "send") {
        return sendJson(res, 200, sendAsBot(id, body));
      }
      if (method === "POST" && action === "sim-customer") {
        return sendJson(res, 200, simCustomer(id, body));
      }
    }

    // --- static ---
    if (method === "GET") {
      if (p === "/" || p === "/index.html") {
        return serveStatic(res, path.join(PUBLIC, "index.html"));
      }
      const safe = path.normalize(p).replace(/^(\.\.(\/|\\|$))+/, "");
      const file = path.join(PUBLIC, safe);
      if (file.startsWith(PUBLIC)) {
        return serveStatic(res, file);
      }
    }

    sendJson(res, 404, { error: "not found", path: p });
  } catch (err) {
    sendJson(res, err.status || 500, {
      error: err.message || String(err),
    });
  }
});

// background auto-resume
setInterval(() => {
  try {
    tickAutoResume();
  } catch {
    /* ignore */
  }
}, 5_000);

server.listen(PORT, HOST, () => {
  console.log(`🎛  Ohamar Ops Console  http://${HOST}:${PORT}`);
  console.log(`   idle auto-resume: ${getConfig().idle_label}`);
  console.log(`   auth: ${TOKEN ? "Bearer OPS_TOKEN" : "open (local demo)"}`);
  console.log(`   demo: open UI → Tiếp quản / Gửi / đợi auto AI`);
});
