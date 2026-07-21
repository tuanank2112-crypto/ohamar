#!/usr/bin/env node
/**
 * Backup data/ and data-worker/ separately (never mix instances).
 *
 *   npm run backup
 *   npm run backup:main
 *   npm run backup:worker
 *
 * Dest: backups/YYYY-MM-DD_HHMMSS/{main|worker}.tar.gz
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const which = (process.argv[2] || "all").toLowerCase(); // all|main|worker
const stamp = new Date()
  .toISOString()
  .replace(/[:.]/g, "")
  .replace("T", "_")
  .slice(0, 15);
const outDir = path.join(ROOT, "backups", stamp);
fs.mkdirSync(outDir, { recursive: true });

const targets = [];
if (which === "all" || which === "main") {
  targets.push({ name: "main", dir: "data" });
}
if (which === "all" || which === "worker") {
  targets.push({ name: "worker", dir: "data-worker" });
}

// Exclude noisy/ephemeral
const excludes = [
  "--exclude=cache",
  "--exclude=*.sqlite-shm",
  "--exclude=*.sqlite-wal",
  "--exclude=ohamar-gateway.pid",
  "--exclude=ohamar-gateway.lock",
];

let failed = 0;
for (const t of targets) {
  const src = path.join(ROOT, t.dir);
  if (!fs.existsSync(src)) {
    console.warn(`⚠️  skip missing ${t.dir}`);
    continue;
  }
  const dest = path.join(outDir, `${t.name}.tar.gz`);
  console.log(`📦 Backup ${t.name} → ${dest}`);
  const r = spawnSync(
    "tar",
    ["-czf", dest, ...excludes, "-C", ROOT, t.dir],
    { stdio: "inherit" },
  );
  if ((r.status ?? 1) !== 0) {
    console.error(`✗ Failed ${t.name}`);
    failed++;
  } else {
    const st = fs.statSync(dest);
    console.log(`   ✓ ${(st.size / 1024 / 1024).toFixed(2)} MB`);
  }
}

// Keep workspace brain lightly (optional docs, not secrets)
if (which === "all") {
  for (const w of ["workspace", "workspace-worker"]) {
    const src = path.join(ROOT, w);
    if (!fs.existsSync(src)) continue;
    const dest = path.join(outDir, `${w}.tar.gz`);
    console.log(`📦 Backup ${w} → ${dest}`);
    spawnSync(
      "tar",
      [
        "-czf",
        dest,
        "--exclude=memory",
        "--exclude=zaloclaw",
        "--exclude=*.pyc",
        "--exclude=__pycache__",
        "-C",
        ROOT,
        w,
      ],
      { stdio: "inherit" },
    );
  }
}

console.log(`\n✓ Backups under ${outDir}`);
console.log(`  (cron example: 0 3 * * * cd ${ROOT} && npm run backup)`);
process.exit(failed ? 1 : 0);
