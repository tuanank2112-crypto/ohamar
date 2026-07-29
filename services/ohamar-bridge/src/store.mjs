import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.BRIDGE_DATA_DIR || path.join(__dirname, "..", "data");
const DB_PATH = process.env.BRIDGE_DB_PATH || path.join(DATA_DIR, "bridge-store.db");
const LEGACY_JSON = path.join(DATA_DIR, "bridge-store.json");
const MAX_EVENTS = Number(process.env.BRIDGE_MAX_EVENTS || 500);
const ALLOWED_MODES = ["ai_active", "human_paused", "human_pinned"];

let db;

function getDb() {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_modes (
      key        TEXT PRIMARY KEY,
      bot        TEXT NOT NULL,
      thread_id  TEXT NOT NULL,
      mode       TEXT NOT NULL,
      actor      TEXT,
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS events (
      seq         INTEGER PRIMARY KEY AUTOINCREMENT,
      id          TEXT NOT NULL,
      type        TEXT NOT NULL,
      at          TEXT NOT NULL,
      detail_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_events_seq ON events(seq DESC);
  `);
  maybeImportLegacy();
  return db;
}

/** Chạy fn trong 1 transaction; rollback nếu lỗi. */
function tx(fn) {
  const d = db;
  d.exec("BEGIN IMMEDIATE");
  try {
    const out = fn(d);
    d.exec("COMMIT");
    return out;
  } catch (err) {
    try {
      d.exec("ROLLBACK");
    } catch { }
    throw err;
  }
}

/**
 * Import 1 lần từ bridge-store.json cũ (nếu có) khi DB còn rỗng, giữ lại
 * ai_modes + events. Sau khi import thành công đổi tên file JSON để không
 * import lại (và không xóa dữ liệu gốc — còn cứu được nếu cần).
 */
function maybeImportLegacy() {
  if (!fs.existsSync(LEGACY_JSON)) return;
  const nEvents = db.prepare("SELECT COUNT(*) AS n FROM events").get().n;
  const nModes = db.prepare("SELECT COUNT(*) AS n FROM ai_modes").get().n;
  if (nEvents > 0 || nModes > 0) return; // DB đã có dữ liệu, không ghi đè

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(LEGACY_JSON, "utf8"));
  } catch (err) {
    console.error(`[bridge-store] bỏ qua import JSON hỏng: ${err.message}`);
    return;
  }
  if (!parsed || typeof parsed !== "object") return;

  const modes = parsed.ai_modes && typeof parsed.ai_modes === "object" ? parsed.ai_modes : {};
  const events = Array.isArray(parsed.events) ? parsed.events : [];

  tx((d) => {
    const upMode = d.prepare(
      `INSERT INTO ai_modes (key, bot, thread_id, mode, actor, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         bot = excluded.bot, thread_id = excluded.thread_id,
         mode = excluded.mode, actor = excluded.actor,
         updated_at = excluded.updated_at`,
    );
    for (const [k, row] of Object.entries(modes)) {
      if (!row || typeof row !== "object") continue;
      const [bot, thread_id] = k.includes("::") ? k.split("::") : [row.bot, row.thread_id];
      upMode.run(
        k,
        String(row.bot ?? bot ?? ""),
        String(row.thread_id ?? thread_id ?? ""),
        String(row.mode ?? "ai_active"),
        row.actor ?? null,
        row.updated_at ?? null,
      );
    }
    // events cũ lưu newest-first; chèn theo thứ tự đảo để seq tăng dần = cũ -> mới.
    const insEv = d.prepare(
      "INSERT INTO events (id, type, at, detail_json) VALUES (?, ?, ?, ?)",
    );
    for (const ev of [...events].reverse()) {
      if (!ev || typeof ev !== "object") continue;
      const { id, type, at, ...detail } = ev;
      insEv.run(
        String(id ?? crypto.randomUUID()),
        String(type ?? "unknown"),
        String(at ?? new Date().toISOString()),
        JSON.stringify(detail),
      );
    }
    trimEvents(d);
  });

  const dest = `${LEGACY_JSON}.imported-${Date.now()}`;
  try {
    fs.renameSync(LEGACY_JSON, dest);
    console.log(
      `[bridge-store] đã import ${Object.keys(modes).length} ai_modes + ${events.length} events từ JSON -> SQLite; lưu bản gốc tại ${dest}`,
    );
  } catch (err) {
    console.error(`[bridge-store] import xong nhưng không đổi tên được JSON: ${err.message}`);
  }
}

function trimEvents(d) {
  d.prepare(
    `DELETE FROM events WHERE seq NOT IN (
       SELECT seq FROM events ORDER BY seq DESC LIMIT ?
     )`,
  ).run(MAX_EVENTS);
}

function key(bot, threadId) {
  const b = String(bot);
  const t = String(threadId);
  if (b.includes("::") || t.includes("::")) {
    const e = new Error('bot and thread_id must not contain "::"');
    e.status = 400;
    throw e;
  }
  return `${b}::${t}`;
}

export function getAiMode(bot, threadId) {
  const d = getDb();
  const row = d
    .prepare("SELECT bot, thread_id, mode, actor, updated_at FROM ai_modes WHERE key = ?")
    .get(key(bot, threadId));
  if (!row) return { mode: "ai_active", updated_at: null, actor: null };
  return {
    mode: row.mode,
    updated_at: row.updated_at,
    actor: row.actor,
    bot: row.bot,
    thread_id: row.thread_id,
  };
}

export function setAiMode(bot, threadId, mode, actor = "crm") {
  if (!ALLOWED_MODES.includes(mode)) {
    const e = new Error(`mode must be one of ${ALLOWED_MODES.join(", ")}`);
    e.status = 400;
    throw e;
  }
  const d = getDb();
  const k = key(bot, threadId);
  const now = new Date().toISOString();
  return tx(() => {
    d.prepare(
      `INSERT INTO ai_modes (key, bot, thread_id, mode, actor, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         mode = excluded.mode, actor = excluded.actor,
         updated_at = excluded.updated_at`,
    ).run(k, String(bot), String(threadId), mode, actor, now);

    d.prepare(
      "INSERT INTO events (id, type, at, detail_json) VALUES (?, ?, ?, ?)",
    ).run(
      crypto.randomUUID(),
      "ai_mode",
      now,
      JSON.stringify({ bot, thread_id: threadId, mode, actor }),
    );
    trimEvents(d);
    return { mode, updated_at: now, actor, bot, thread_id: threadId };
  });
}

export function listEvents(limit = 50) {
  const d = getDb();
  const rows = d
    .prepare("SELECT id, type, at, detail_json FROM events ORDER BY seq DESC LIMIT ?")
    .all(Number(limit) || 50);
  return rows.map((r) => {
    let detail = {};
    try {
      detail = JSON.parse(r.detail_json) || {};
    } catch { /* ignore */ }
    return { ...detail, id: r.id, type: r.type, at: r.at };
  });
}

export function logEvent(type, detail = {}) {
  const d = getDb();
  return tx(() => {
    d.prepare(
      "INSERT INTO events (id, type, at, detail_json) VALUES (?, ?, ?, ?)",
    ).run(
      crypto.randomUUID(),
      String(type),
      new Date().toISOString(),
      JSON.stringify(detail ?? {}),
    );
    trimEvents(d);
  });
}