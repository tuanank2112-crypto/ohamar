#!/usr/bin/env node
/**
 * Ohamar Bridge — Phase 1
 * CRM / ops call this; Zalo send goes to Ohamar gateways (zaloclaw).
 *
 *   OHAMAR_ROOT=~/ohamar node services/ohamar-bridge/src/server.mjs
 *   → http://127.0.0.1:18794
 *
 * Env:
 *   BRIDGE_PORT=18794
 *   BRIDGE_HOST=127.0.0.1
 *   BRIDGE_TOKEN=            BẮT BUỘC (tối thiểu 16 ký tự) trừ khi BRIDGE_ALLOW_OPEN=1
 *   BRIDGE_ALLOW_OPEN=1      chạy KHÔNG auth (chỉ dev, phải bật tường minh)
 *   BRIDGE_DRY_RUN=1         không bao giờ gửi Zalo thật
 *   BRIDGE_MAX_BODY=262144   giới hạn body request (bytes)
 *   BRIDGE_ALLOWED_ORIGINS=  danh sách origin cho CORS, phân tách bằng dấu phẩy (mặc định: rỗng)
 *   BRIDGE_ALLOWED_HOSTS=    Host header hợp lệ bổ sung
 *   OHAMAR_MAIN_HOST/PORT    default 127.0.0.1:18789
 *   OHAMAR_WORKER_HOST/PORT  default 127.0.0.1:18790
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { listBots, botStatus } from "./bots.mjs";
import { sendMessage } from "./send.mjs";
import { getAiMode, setAiMode, listEvents, logEvent } from "./store.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const HOST = process.env.BRIDGE_HOST || "127.0.0.1";
const PORT = Number(process.env.BRIDGE_PORT || 18794);
const TOKEN = (process.env.BRIDGE_TOKEN || "").trim();
const ALLOW_OPEN = process.env.BRIDGE_ALLOW_OPEN === "1";
const MAX_BODY = Number(process.env.BRIDGE_MAX_BODY || 256 * 1024);
const PUBLIC = path.join(__dirname, "..", "public");

// ---------------------------------------------------------------------------
// Fail-closed startup checks
// ---------------------------------------------------------------------------
if (!TOKEN && !ALLOW_OPEN) {
  console.error(
    "[bridge] REFUSING TO START: BRIDGE_TOKEN chưa được set.\n" +
    "         Bridge có thể gửi tin nhắn Zalo thật, không được chạy mở.\n" +
    "         Fix: export BRIDGE_TOKEN=$(openssl rand -hex 24)\n" +
    "         Hoặc (chỉ dev): BRIDGE_ALLOW_OPEN=1",
  );
  process.exit(1);
}
if (TOKEN && TOKEN.length < 16) {
  console.error(
    `[bridge] REFUSING TO START: BRIDGE_TOKEN quá ngắn (${TOKEN.length} ký tự, cần >= 16).`,
  );
  process.exit(1);
}

// CORS: mặc định KHÔNG cho origin nào. Phải khai báo tường minh.
const ALLOWED_ORIGINS = (process.env.BRIDGE_ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Chống DNS rebinding: chỉ chấp nhận Host header quen thuộc.
const ALLOWED_HOSTS = new Set(
  ["127.0.0.1", "localhost", "::1", "[::1]", HOST].concat(
    (process.env.BRIDGE_ALLOWED_HOSTS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  ),
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function hostAllowed(req) {
  const raw = String(req.headers.host || "");
  if (!raw) return false;
  const host = raw.startsWith("[")
    ? raw.slice(0, raw.indexOf("]") + 1)
    : raw.split(":")[0];
  return ALLOWED_HOSTS.has(host);
}

function corsHeaders(req) {
  const origin = req.headers.origin;
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "600",
  };
}

function send(req, res, status, obj) {
  const body = JSON.stringify(obj, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...corsHeaders(req),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers["content-length"] || 0);
    if (declared > MAX_BODY) {
      return reject(
        Object.assign(new Error("payload too large"), { status: 413 }),
      );
    }
    const chunks = [];
    let size = 0;
    let settled = false;

    req.on("data", (c) => {
      if (settled) return;
      size += c.length;
      if (size > MAX_BODY) {
        settled = true;
        reject(Object.assign(new Error("payload too large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });

    req.on("end", () => {
      if (settled) return;
      settled = true;
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return reject(
          Object.assign(new Error("invalid JSON"), { status: 400 }),
        );
      }
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        return reject(
          Object.assign(new Error("body must be a JSON object"), {
            status: 400,
          }),
        );
      }
      resolve(parsed);
    });

    req.on("error", (e) => {
      if (settled) return;
      settled = true;
      reject(e);
    });
  });
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a), "utf8");
  const bb = Buffer.from(String(b), "utf8");
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// Chỉ nhận pathname ĐÃ normalize. Không bao giờ đọc req.url thô.
const PUBLIC_PATHS = new Set(["/", "/ui", "/ui/", "/v1/health"]);

function auth(req, pathname) {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (!TOKEN) return ALLOW_OPEN;
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || "");
  return Boolean(m && safeEqual(m[1].trim(), TOKEN));
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  try {
    // 1) Host header check (chống DNS-rebinding)
    if (!hostAllowed(req)) {
      return send(req, res, 421, { error: "host not allowed" });
    }

    // 2) Parse + normalize URL TRƯỚC khi auth (fix path confusion)
    let url;
    try {
      url = new URL(req.url || "/", `http://${HOST}:${PORT}`);
    } catch {
      return send(req, res, 400, { error: "bad request target" });
    }
    const p = url.pathname;
    const method = req.method || "GET";

    // 3) Preflight: chỉ trả CORS cho origin trong allowlist
    if (method === "OPTIONS") {
      const h = corsHeaders(req);
      res.writeHead(Object.keys(h).length ? 204 : 403, h);
      return res.end();
    }

    // 4) Auth trên pathname đã normalize
    if (!auth(req, p)) {
      return send(req, res, 401, { error: "unauthorized" });
    }

    // --- Static UI ---
    if (method === "GET" && (p === "/" || p === "/ui" || p === "/ui/")) {
      const html = path.join(PUBLIC, "index.html");
      if (fs.existsSync(html)) {
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "X-Content-Type-Options": "nosniff",
        });
        fs.createReadStream(html).pipe(res);
        return;
      }
    }

    // --- Health ---
    if (method === "GET" && p === "/v1/health") {
      return send(req, res, 200, {
        ok: true,
        service: "ohamar-bridge",
        phase: 1,
        dry_run: process.env.BRIDGE_DRY_RUN === "1",
        auth: TOKEN ? "bearer" : "open",
        time: new Date().toISOString(),
      });
    }

    // --- Bots ---
    if (method === "GET" && p === "/v1/bots") {
      return send(req, res, 200, await listBots());
    }

    if (method === "GET" && p.startsWith("/v1/bots/")) {
      const id = p.slice("/v1/bots/".length);
      if (id !== "main" && id !== "worker") {
        return send(req, res, 404, { error: "unknown bot", id });
      }
      return send(req, res, 200, { bot: await botStatus(id) });
    }

    // --- Events ---
    if (method === "GET" && p === "/v1/events") {
      return send(req, res, 200, { events: listEvents(80) });
    }

    // --- AI mode ---
    if (method === "GET" && p === "/v1/ai-mode") {
      const bot = url.searchParams.get("bot") === "worker" ? "worker" : "main";
      const threadId = (url.searchParams.get("thread_id") || "").trim();
      if (!threadId) {
        return send(req, res, 400, { error: "thread_id required" });
      }
      return send(req, res, 200, {
        bot,
        thread_id: threadId,
        ...getAiMode(bot, threadId),
      });
    }

    if (method === "POST" && p === "/v1/ai-mode") {
      const body = await readBody(req);
      const bot = body.bot === "worker" ? "worker" : "main";
      const threadId = String(body.thread_id || "").trim();
      const mode = String(body.mode || "").trim();
      if (!threadId || !mode) {
        return send(req, res, 400, { error: "thread_id and mode required" });
      }
      const row = setAiMode(bot, threadId, mode, body.actor || "crm");
      return send(req, res, 200, { ok: true, ...row });
    }

    // --- Send ---
    if (method === "POST" && p === "/v1/send") {
      const body = await readBody(req);
      const result = await sendMessage({
        bot: body.bot,
        target: body.target,
        text: body.text,
        is_group: body.is_group,
        force: body.force,
        dry_run: body.dry_run,
      });
      return send(req, res, 200, result);
    }

    // --- Inbound ack (phase 2 stub) ---
    if (method === "POST" && p === "/v1/events/inbound") {
      const body = await readBody(req);
      logEvent("inbound_ack", {
        bot: body.bot,
        thread_id: body.thread_id,
        preview: String(body.text || "").slice(0, 80),
      });
      return send(req, res, 202, {
        ok: true,
        accepted: true,
        note: "phase2: fan-out to CRM not implemented yet",
      });
    }

    send(req, res, 404, { error: "not found", path: p });
  } catch (err) {
    send(req, res, err.status || 500, {
      error: err.message || String(err),
      detail: err.detail,
    });
  }
});

server.headersTimeout = 15_000;
server.requestTimeout = 30_000;

server.listen(PORT, HOST, () => {
  console.log(`🌉 Ohamar Bridge  http://${HOST}:${PORT}`);
  console.log(`   phase 1: GET /v1/bots  POST /v1/send  GET|POST /v1/ai-mode`);
  console.log(`   dry_run: ${process.env.BRIDGE_DRY_RUN === "1" ? "ON" : "off"}`);
  console.log(`   UI:      http://${HOST}:${PORT}/`);
  console.log(
    `   auth:    ${TOKEN ? "Bearer BRIDGE_TOKEN" : "⚠️  OPEN (BRIDGE_ALLOW_OPEN=1)"}`,
  );
  console.log(
    `   cors:    ${ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS.join(", ") : "disabled"}`,
  );
  console.log(`   maxBody: ${MAX_BODY} bytes`);
});