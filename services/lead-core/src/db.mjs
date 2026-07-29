import crypto from "node:crypto";
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

export function nowIso() {
  return new Date().toISOString();
}

export function uuid() {
  return crypto.randomUUID();
}

/** Chạy fn trong 1 transaction. Rollback nếu fn ném lỗi. */
export function tx(fn) {
  const d = getDb();
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

function checksum(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

/** Thư mục chứa migration file (đọc tại thời điểm gọi để test override được). */
function migrationsDir() {
  return process.env.LEAD_CORE_MIGRATIONS_DIR || path.join(ROOT, "migrations");
}

/**
 * P10: migration framework có phiên bản.
 *
 *  1) Baseline: chạy schema.sql (idempotent, CREATE ... IF NOT EXISTS) MỖI lần
 *     để đảm bảo bảng lõi luôn tồn tại — giữ nguyên hành vi cũ.
 *  2) Versioned: chạy các file migrations/*.sql theo thứ tự tên, MỖI FILE
 *     ĐÚNG MỘT LẦN, trong 1 transaction, ghi lại vào schema_migrations.
 *     Nếu file đã áp dụng nhưng nội dung đổi (checksum khác) -> cảnh báo,
 *     KHÔNG chạy lại (bắt buộc tạo migration mới thay vì sửa file cũ).
 *
 * Quy ước file migration: đặt tên tăng dần (ví dụ 0001_x.sql, 0002_y.sql),
 * KHÔNG tự viết BEGIN/COMMIT trong file (framework đã bọc transaction).
 */
export function migrate() {
  const d = getDb();

  d.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    TEXT PRIMARY KEY,
    checksum   TEXT NOT NULL,
    applied_at TEXT NOT NULL
  );`);

  // 1) Baseline schema.sql (idempotent)
  const baselinePath = path.join(ROOT, "schema.sql");
  const baselineSql = fs.readFileSync(baselinePath, "utf8");
  d.exec(baselineSql);
  d.prepare(
    `INSERT INTO schema_migrations (version, checksum, applied_at)
     VALUES ('000_baseline', ?, ?)
     ON CONFLICT(version) DO UPDATE SET
       checksum = excluded.checksum, applied_at = excluded.applied_at`,
  ).run(checksum(baselineSql), nowIso());

  // 2) Versioned migrations
  const dir = migrationsDir();
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  } catch {
    files = [];
  }

  const getRow = d.prepare("SELECT checksum FROM schema_migrations WHERE version = ?");
  const record = d.prepare(
    "INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (?, ?, ?)",
  );

  const applied = [];
  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    const sum = checksum(sql);
    const row = getRow.get(file);
    if (row) {
      if (row.checksum !== sum) {
        console.warn(
          `⚠️  migration ${file} đã áp dụng nhưng NỘI DUNG ĐÃ THAY ĐỔI ` +
          `(checksum khác). Không chạy lại — hãy tạo migration MỚI thay vì sửa file cũ.`,
        );
      }
      continue;
    }
    d.exec("BEGIN IMMEDIATE");
    try {
      d.exec(sql);
      record.run(file, sum, nowIso());
      d.exec("COMMIT");
    } catch (err) {
      try {
        d.exec("ROLLBACK");
      } catch { }
      throw new Error(`migration ${file} thất bại: ${err.message}`);
    }
    applied.push(file);
  }

  if (applied.length) {
    console.log(`✓ đã áp dụng ${applied.length} migration mới: ${applied.join(", ")}`);
  }
  return DB_PATH;
}