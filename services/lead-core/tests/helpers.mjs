/**
 * Test harness cho Lead Core.
 *
 * Lưu ý quan trọng về thứ tự import:
 *   config.mjs đọc process.env NGAY LÚC IMPORT, và db.mjs cache connection ở
 *   module scope. Vì vậy LEAD_CORE_DB phải được set TRƯỚC khi import db.mjs.
 *   File này làm việc đó bằng top-level await + dynamic import.
 *
 * Không dùng ":memory:" được, vì config.mjs chạy path.resolve(ROOT, LEAD_CORE_DB)
 * nên ":memory:" sẽ biến thành một đường dẫn file thật.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Mỗi file test chạy trong 1 process riêng (node --test), nên pid là đủ để tách biệt.
const DB_REL = `./data/test-${process.pid}.db`;
process.env.LEAD_CORE_DB = DB_REL;
process.env.LEAD_CORE_LEASE_TTL_SEC = process.env.LEAD_CORE_LEASE_TTL_SEC || "45";

const DB_ABS = path.resolve(ROOT, DB_REL);
for (const suffix of ["", "-wal", "-shm"]) {
    try {
        fs.rmSync(DB_ABS + suffix, { force: true });
    } catch { }
}
fs.mkdirSync(path.dirname(DB_ABS), { recursive: true });

const db = await import("../src/db.mjs");
export const handlers = await import("../src/handlers.mjs");
export const config = await import("../src/config.mjs");

db.migrate();

const TABLES = [
    "send_leases",
    "outbound_log",
    "handoffs",
    "consents",
    "processed_messages",
    "audit_events",
    "watch_snapshots",
    "conversations",
];

export function resetDb() {
    const d = db.getDb();
    d.exec("PRAGMA foreign_keys = OFF;");
    for (const t of TABLES) d.exec(`DELETE FROM ${t};`);
    d.exec("PRAGMA foreign_keys = ON;");
}

export function getDb() {
    return db.getDb();
}

let seq = 0;
function nextId(prefix) {
    seq += 1;
    return `${prefix}-${seq}`;
}

/** Tạo một conversation mới qua đường inbound thật. */
export function newConversation(overrides = {}) {
    const res = handlers.ingestEvent({
        channel: "zalo",
        source_user_id: nextId("user"),
        thread_id: nextId("thread"),
        source_message_id: nextId("msg"),
        text: "xin chào",
        ...overrides,
    });
    return res.conversation;
}

/** Tạo conversation đã có chủ sở hữu. */
export function ownedConversation(owner = "gia_huy") {
    const conv = newConversation();
    return handlers.claimOwnership(conv.id, { caller: owner });
}

export function idem(prefix = "idem") {
    return nextId(prefix);
}

/** Bắt lỗi và trả về status code để assert gọn hơn. */
export function catchStatus(fn) {
    try {
        fn();
        return null;
    } catch (err) {
        return err.status ?? 500;
    }
}