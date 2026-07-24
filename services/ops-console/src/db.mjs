/**
 * SQLite-free file store for ops-console demo (JSON on disk).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "..");
export const DATA_DIR = process.env.OPS_DATA_DIR || path.join(ROOT, "data");
const STORE = path.join(DATA_DIR, "ops-store.json");
const SEED_VERSION = 2;

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
    meta: { version: 1, seed_version: 0, created_at: nowIso() },
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

function pushThread(store, t, msgs) {
  store.threads.push(t);
  for (const m of msgs) store.messages.push(m);
}

/** Seed demo: DM + group like Zalo inbox */
export function ensureSeed(store) {
  const needSeed =
    !store.threads.length ||
    Number(store.meta?.seed_version || 0) < SEED_VERSION;

  if (!needSeed) return store;

  // Re-seed clean when upgrading seed version
  store.threads = [];
  store.messages = [];
  store.events = [];
  store.meta = {
    ...(store.meta || {}),
    seed_version: SEED_VERSION,
    created_at: store.meta?.created_at || nowIso(),
  };

  const ts = Date.now();

  // —— DM (1-1) ——
  const dms = [
    {
      bot: "main",
      botLabel: "Gia Huy Vicamed",
      peerName: "Chị Lan",
      peerId: "demo-peer-lan",
      preview: "Cho em hỏi giá filler môi ạ?",
      unread: 2,
    },
    {
      bot: "main",
      botLabel: "Gia Huy Vicamed",
      peerName: "Anh Minh",
      peerId: "demo-peer-minh",
      preview: "Lịch tái khám tuần sau được không?",
      unread: 0,
    },
    {
      bot: "worker",
      botLabel: "Minh Phát Vicamed",
      peerName: "Chị Hương",
      peerId: "demo-peer-huong",
      preview: "Em muốn nói chuyện với người thật ạ",
      unread: 1,
    },
  ];

  for (const d of dms) {
    const id = uuid();
    const threadId = `zalo-dm-${d.peerId}`;
    pushThread(
      store,
      {
        id,
        bot: d.bot,
        bot_label: d.botLabel,
        channel: d.bot === "worker" ? "zalo_worker" : "zalo_main",
        thread_type: "dm",
        peer_id: d.peerId,
        peer_name: d.peerName,
        thread_id: threadId,
        member_count: 2,
        last_sender_name: d.peerName,
        unread: d.unread,
        pinned_chat: false,
        mute: false,
        ai_mode: "ai_active",
        paused_at: null,
        paused_by: null,
        last_activity_at: new Date(ts - Math.random() * 600_000).toISOString(),
        last_preview: d.preview,
        created_at: new Date(ts - 3600_000).toISOString(),
        updated_at: new Date(ts).toISOString(),
      },
      [
        {
          id: uuid(),
          thread_pk: id,
          role: "customer",
          sender_name: d.peerName,
          text: d.preview,
          at: new Date(ts - 120_000).toISOString(),
        },
        {
          id: uuid(),
          thread_pk: id,
          role: "ai",
          sender_name: d.botLabel,
          text: "Dạ em gửi thông tin tham khảo ạ. Chị cần tư vấn thêm không ạ?",
          at: new Date(ts - 90_000).toISOString(),
        },
      ],
    );
  }

  // —— Groups (nhóm Zalo) ——
  const groups = [
    {
      bot: "main",
      botLabel: "Gia Huy Vicamed",
      peerName: "Vicamed · CSKH miền Bắc",
      peerId: "group-cskh-bac",
      member_count: 48,
      preview: "Huyền: @Gia Huy lịch live tối nay chốt chưa ạ?",
      lastSender: "Huyền",
      unread: 5,
      pinned: true,
    },
    {
      bot: "main",
      botLabel: "Gia Huy Vicamed",
      peerName: "Sale filler · team A",
      peerId: "group-sale-a",
      member_count: 12,
      preview: "Tuấn: Lead FB sáng nay em nhét sheet rồi",
      lastSender: "Tuấn",
      unread: 0,
      pinned: false,
    },
    {
      bot: "worker",
      botLabel: "Minh Phát Vicamed",
      peerName: "Vicamed · CSKH miền Nam",
      peerId: "group-cskh-nam",
      member_count: 36,
      preview: "Bot: Dạ em đã ghi nhận yêu cầu của chị ạ",
      lastSender: "Minh Phát Vicamed",
      unread: 3,
      pinned: false,
    },
    {
      bot: "worker",
      botLabel: "Minh Phát Vicamed",
      peerName: "Nội bộ · ca chiều",
      peerId: "group-ca-chieu",
      member_count: 8,
      preview: "Mai: Nhắc bot đừng spam group nhé",
      lastSender: "Mai",
      unread: 0,
      pinned: false,
    },
  ];

  for (const g of groups) {
    const id = uuid();
    const threadId = `zalo-group-${g.peerId}`;
    const msgs = [
      {
        id: uuid(),
        thread_pk: id,
        role: "customer",
        sender_name: "An",
        text: "Mọi người ơi giá combo filler tháng này sao ạ?",
        at: new Date(ts - 400_000).toISOString(),
      },
      {
        id: uuid(),
        thread_pk: id,
        role: "customer",
        sender_name: g.lastSender === "Bot" ? "Lan" : g.lastSender,
        text:
          g.lastSender === "Minh Phát Vicamed" || g.lastSender?.includes("Vicamed")
            ? "…"
            : g.preview.includes(":")
              ? g.preview.split(":").slice(1).join(":").trim()
              : g.preview,
        at: new Date(ts - 200_000).toISOString(),
      },
      {
        id: uuid(),
        thread_pk: id,
        role: g.lastSender?.includes("Vicamed") || g.lastSender === "Bot" ? "ai" : "customer",
        sender_name: g.lastSender,
        text:
          g.lastSender?.includes("Vicamed") || g.lastSender === "Bot"
            ? "Dạ em đã ghi nhận yêu cầu, team sẽ phản hồi sớm ạ."
            : g.preview.includes(":")
              ? g.preview.split(":").slice(1).join(":").trim()
              : g.preview,
        at: new Date(ts - 80_000).toISOString(),
      },
    ];
    // fix last preview message
    const last = msgs[msgs.length - 1];
    last.text =
      g.preview.includes(":")
        ? g.preview.split(":").slice(1).join(":").trim()
        : g.preview;
    last.sender_name = g.lastSender;
    last.role =
      g.lastSender?.includes("Vicamed") || g.lastSender === "Bot" ? "ai" : "customer";

    pushThread(
      store,
      {
        id,
        bot: g.bot,
        bot_label: g.botLabel,
        channel: g.bot === "worker" ? "zalo_worker" : "zalo_main",
        thread_type: "group",
        peer_id: g.peerId,
        peer_name: g.peerName,
        thread_id: threadId,
        member_count: g.member_count,
        last_sender_name: g.lastSender,
        unread: g.unread,
        pinned_chat: g.pinned,
        mute: false,
        ai_mode: "ai_active",
        paused_at: null,
        paused_by: null,
        last_activity_at: new Date(ts - Math.random() * 300_000).toISOString(),
        last_preview: g.preview,
        created_at: new Date(ts - 86400_000).toISOString(),
        updated_at: new Date(ts).toISOString(),
      },
      msgs,
    );
  }

  // Sort by activity
  store.threads.sort((a, b) =>
    a.last_activity_at < b.last_activity_at ? 1 : -1,
  );

  saveStore(store);
  return store;
}
