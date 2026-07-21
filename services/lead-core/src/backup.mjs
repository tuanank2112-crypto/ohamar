#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { DB_PATH, ROOT, RETENTION_DAYS } from "./config.mjs";

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = path.join(ROOT, "../../backups/lead-core", stamp);
fs.mkdirSync(outDir, { recursive: true });

if (!fs.existsSync(DB_PATH)) {
  console.error("No DB at", DB_PATH);
  process.exit(1);
}

const dest = path.join(outDir, "lead.db");
fs.copyFileSync(DB_PATH, dest);
// copy wal/shm if present
for (const s of ["-wal", "-shm"]) {
  const p = DB_PATH + s;
  if (fs.existsSync(p)) fs.copyFileSync(p, dest + s);
}

console.log("✓ backup →", dest);
console.log(`  retention policy (ops): ${RETENTION_DAYS} days — enforce manually or cron`);
