/**
 * SQLite-free file store for ops-console demo (JSON on disk).
 * Swap to better-sqlite3 later if needed.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "..");
export const DATA_DIR = process.env.OPS_DATA_DIR || path.join(ROOT, "data");
const STORE = path.join(DATA_DIR, "ops-store.json");

export function uuid() {
  return crypto.randomUUID();
}

export function nowIso() {
  return new Date().toISOString();
}

function emptyStore() {
  return {
    threads: [],
    messages: [],
    events: [],
    meta: { version: 1, created_at: nowIso() },
  };
}

export function loadStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE)) {
    const s = emptyStore();
    saveStore(s);
    return s;
  }
  try {
    return JSON.parse(fs.readFileSync(STORE, "utf8"));
  } catch {
    const s = emptyStore();
    saveStore(s);
    return s;
  }
}

export function saveStore(store) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = STORE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), "utf8");
  fs.renameSync(tmp, STORE);
}

/** Seed demo threads if empty */
export function ensureSeed(store) {
  if (store.threads.length > 0) return store;
  const ts = Date.now();
  const demos = [
    {
      bot: "main",
      botLabel: "Gia Huy Vicamed",
      peerName: "Chị Lan (demo)",
      peerId: "demo-peer-lan",
      preview: "Cho em hỏi giá filler môi ạ?",
    },
    {
      bot: "main",
      botLabel: "Gia Huy Vicamed",
      peerName: "Anh Minh (demo)",
      peerId: "demo-peer-minh",
      preview: "Lịch tái khám tuần sau được không?",
    },
    {
      bot: "worker",
      botLabel: "Minh Phát Vicamed",
      peerName: "Chị Hương (demo)",
      peerId: "demo-peer-huong",
      preview: "Bot vừa tư vấn xong, em muốn nói chuyện với người",
    },
  ];

  for (const d of demos) {
    const id = uuid();
    const threadId = `zalo-dm-${d.peerId}`;
    store.threads.push({
      id,
      bot: d.bot,
      bot_label: d.botLabel,
      channel: d.bot === "worker" ? "zalo_worker" : "zalo_main",
      peer_id: d.peerId,
      peer_name: d.peerName,
      thread_id: threadId,
      // ai_active | human_paused | human_pinned
      ai_mode: "ai_active",
      paused_at: null,
      paused_by: null,
      last_activity_at: new Date(ts).toISOString(),
      last_preview: d.preview,
      created_at: new Date(ts - 3600_000).toISOString(),
      updated_at: new Date(ts).toISOString(),
    });
    store.messages.push(
      {
        id: uuid(),
        thread_pk: id,
        role: "customer",
        text: d.preview,
        at: new Date(ts - 120_000).toISOString(),
      },
      {
        id: uuid(),
        thread_pk: id,
        role: "ai",
        text: "Dạ em gửi thông tin tham khảo ạ. Chị cần tư vấn thêm không ạ?",
        at: new Date(ts - 90_000).toISOString(),
      },
    );
  }
  saveStore(store);
  return store;
}
