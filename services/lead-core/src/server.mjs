#!/usr/bin/env node
/**
 * Lead Core HTTP API — bind localhost + bearer token -> IDENTITY.
 *
 * Thay đổi quan trọng so với bản trước:
 *   Token không còn chỉ chứng minh "được phép gọi API" mà còn xác định AI đang gọi.
 *   Handlers không bao giờ đọc body.caller / body.from_owner để phân quyền nữa.
 */
import crypto from "node:crypto";
import http from "node:http";
import { feedToCrm } from "./crm-feed.mjs";
import {
  HOST,
  LEGACY_IDENTITY,
  LEGACY_TOKEN,
  MAX_BODY,
  PORT,
  TOKENS,
  TOKEN_PROBLEMS,
} from "./config.mjs";
import { migrate } from "./db.mjs";
import { parseAllowedOrigins, corsHeadersFor } from "./cors.mjs";
import {
  appendConsent,
  authorizeOutbound,
  claimOwnership,
  closeConversation,
  createHandoff,
  getConversation,
  ingestEvent,
  listWatchSnapshots,
  metrics,
  upsertWatchSnapshot,
  validateLease,
  consumeLease,
} from "./handlers.mjs";

migrate();
const ALLOWED_ORIGINS = parseAllowedOrigins(process.env.LEAD_CORE_ALLOWED_ORIGINS);


for (const p of TOKEN_PROBLEMS) {
  console.warn("⚠️  LEAD_CORE_TOKENS: " + p);
}

if (TOKENS.size === 0 && (!LEGACY_TOKEN || LEGACY_TOKEN.length < 16)) {
  console.error(
    '❌ Chưa cấu hình token. Đặt LEAD_CORE_TOKENS="gia_huy:<token>,minh_phat:<token>,human:<token>" ' +
    "trong services/lead-core/.env (mỗi token >= 16 ký tự).",
  );
  process.exit(1);
}

if (TOKENS.size === 0) {
  console.warn(
    '⚠️  Đang dùng LEAD_CORE_TOKEN dùng chung. Mọi request sẽ được coi là identity "' +
    LEGACY_IDENTITY +
    '". Hãy chuyển sang LEAD_CORE_TOKENS để tách danh tính từng service.',
  );
}

/** So sánh chuỗi theo thời gian hằng số để tránh timing oracle. */
function sameSecret(a, b) {
  // So sánh digest cố định độ dài -> không rò rỉ độ dài token qua timing,
  // đồng thời vẫn constant-time nhờ crypto.timingSafeEqual.
  const da = crypto.createHash("sha256").update(String(a)).digest();
  const db = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(da, db);
}

/**
 * Trả về identity đã xác thực, hoặc null nếu token sai/thiếu.
 * KHÔNG đọc bất cứ thứ gì từ body.
 */
function resolveIdentity(req) {
  const h = req.headers.authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) return null;
  const presented = m[1].trim();
  if (!presented) return null;
  for (const [token, identity] of TOKENS) {
    if (sameSecret(token, presented)) return identity;
  }
  if (LEGACY_TOKEN && sameSecret(LEGACY_TOKEN, presented)) {
    return LEGACY_IDENTITY;
  }
  return null;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let done = false;
    req.on("data", (c) => {
      if (done) return;
      size += c.length;
      if (size > MAX_BODY) {
        done = true;
        reject(Object.assign(new Error("payload too large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (done) return;
      done = true;
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        const parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
          return reject(
            Object.assign(new Error("body must be a JSON object"), { status: 400 }),
          );
        }
        resolve(parsed);
      } catch {
        reject(Object.assign(new Error("invalid JSON"), { status: 400 }));
      }
    });
    req.on("error", (err) => {
      if (done) return;
      done = true;
      reject(err);
    });
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

const BASE = "http" + "://" + HOST + ":" + PORT;

const server = http.createServer(async (req, res) => {
  try {
    // Parse URL TRƯỚC khi phân quyền: mọi quyết định auth phải dựa trên cùng
    // một pathname đã chuẩn hoá mà router sẽ dùng.
    let path;
    try {
      path = new URL(req.url || "/", BASE).pathname;
    } catch {
      return send(res, 400, { error: "bad request target" });
    }
    const method = req.method || "GET";

    // P8: CORS có kiểm soát. Chỉ set header khi Origin nằm trong allowlist.
    const cors = corsHeadersFor(req.headers.origin, ALLOWED_ORIGINS);
    if (cors) {
      for (const [k, v] of Object.entries(cors)) res.setHeader(k, v);
    }
    // Preflight: trả lời trước khi kiểm tra auth (OPTIONS không mang token).
    if (method === "OPTIONS") {
      res.writeHead(cors ? 204 : 403);
      return res.end();
    }

    const isHealth = method === "GET" && path === "/v1/health";
    const identity = resolveIdentity(req);

    if (!identity && !isHealth) {
      return send(res, 401, { error: "unauthorized" });
    }

    // ctx là NGUỒN SỰ THẬT DUY NHẤT về danh tính, truyền xuống mọi handler.
    const ctx = { identity };

    if (isHealth) {
      return send(res, 200, {
        ok: true,
        service: "lead-core",
        host: HOST,
        port: PORT,
        identity_mode: TOKENS.size > 0 ? "per-identity" : "legacy-shared",
        time: new Date().toISOString(),
      });
    }

    if (method === "GET" && path === "/v1/whoami") {
      return send(res, 200, { identity });
    }

    if (method === "GET" && path === "/v1/metrics") {
      return send(res, 200, metrics());
    }

    if (method === "POST" && path === "/v1/events") {
      const body = await readBody(req);
      const result = ingestEvent(body, ctx);
      // fan-out sang CRM (chỉ khi có text thật & không phải bản trùng)
      if (result && !result.duplicate && body.text) {
        feedToCrm({
          direction: "in",
          channel: body.channel,
          thread_id: body.thread_id,
          source_user_id: body.source_user_id,
          source_message_id: body.source_message_id,
          text: body.text,
          ts: new Date().toISOString(),
        });
      }
      return send(res, 200, result);
    }

    if (method === "POST" && path === "/v1/handoffs") {
      const body = await readBody(req);
      return send(res, 200, createHandoff(body, ctx));
    }

    if (method === "POST" && path === "/v1/consents") {
      const body = await readBody(req);
      return send(res, 201, { consent: appendConsent(body, ctx) });
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

    const convMatch =
      /^\/v1\/conversations\/([^/]+)(?:\/(claim|outbound|close|validate-lease))?$/.exec(path);
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
        return send(res, 200, { conversation: claimOwnership(id, body, ctx) });
      }
      if (method === "POST" && action === "outbound") {
        const body = await readBody(req);
        return send(res, 200, authorizeOutbound(id, body, ctx));
      }
      if (method === "POST" && action === "validate-lease") {
        const body = await readBody(req);
        const leaseId = String(body.lease_id || "").trim();
        if (!leaseId) return send(res, 400, { error: "lease_id required" });
        // Danh tính lấy từ token (ctx), không tin body.caller.
        const caller = ctx.identity || null;
        const result =
          body.consume === false
            ? validateLease(id, leaseId, caller)
            : consumeLease(id, leaseId, caller);
        return send(res, result.valid ? 200 : 409, result);
      }
      if (method === "POST" && action === "close") {
        const body = await readBody(req);
        return send(res, 200, { conversation: closeConversation(id, body, ctx) });
      }
    }

    send(res, 404, { error: "not found", path });
  } catch (err) {
    const status = err.status || 500;
    send(res, status, { error: err.message || String(err), status });
  }
});

server.listen(PORT, HOST, () => {
  console.log("🦞 Lead Core listening " + BASE);
  if (TOKENS.size > 0) {
    const ids = [...new Set([...TOKENS.values()])].sort().join(", ");
    console.log("   auth: Bearer per-identity (" + ids + ")");
  } else {
    console.log("   auth: Bearer LEAD_CORE_TOKEN -> identity " + LEGACY_IDENTITY);
  }
  console.log("   open: GET /v1/health");
  console.log("   body: max " + MAX_BODY + " bytes");
  console.log("   db:   see LEAD_CORE_DB");
});

// P7: chống slowloris / request treo. Node mặc định để requestTimeout khá dài.
server.headersTimeout = 15_000;
server.requestTimeout = 30_000;