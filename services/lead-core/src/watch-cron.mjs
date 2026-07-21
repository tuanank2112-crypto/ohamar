#!/usr/bin/env node
/**
 * Cron entry for Vicamed web watch.
 * - Runs hash diff via watch pipeline
 * - Prints NO_REPLY when nothing changed (suppress OpenClaw announce)
 * - Prints digest when changed (for --announce delivery)
 *
 * Used as:
 *   openclaw cron add --cron "0 9,17 * * *" --tz Asia/Ho_Chi_Minh \
 *     --name vicamed-web-watch \
 *     --command "node services/lead-core/src/watch-cron.mjs" \
 *     --command-cwd ~/ohamar \
 *     --announce --channel zaloclaw --to <ownerZaloId> --agent main
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT } from "./config.mjs";

const watchJs = path.join(ROOT, "src/watch.mjs");
const r = spawnSync(process.execPath, [watchJs, "--json"], {
  cwd: ROOT,
  encoding: "utf8",
  env: process.env,
});

if (r.error) {
  console.log(`[Vicamed watch] error: ${r.error.message}`);
  process.exit(0); // best-effort deliver error once
}

let report;
try {
  report = JSON.parse(r.stdout || "{}");
} catch {
  console.log(`[Vicamed watch] parse fail: ${(r.stdout || r.stderr || "").slice(0, 300)}`);
  process.exit(0);
}

if (!report.announce || !report.changed_count) {
  // OpenClaw command jobs: only NO_REPLY suppresses announce
  console.log("NO_REPLY");
  process.exit(0);
}

const lines = [
  "🔔 Vicamed web watch — có thay đổi",
  `Thời điểm (UTC): ${report.ts}`,
  `Số URL đổi: ${report.changed_count}`,
  "",
];
for (const x of report.results || []) {
  if (x.ok && x.changed) {
    lines.push(`• ${x.url}`);
    lines.push(`  hash ${x.hash}${x.previous ? ` (trước ${x.previous})` : ""}`);
  } else if (!x.ok) {
    lines.push(`• Lỗi ${x.url}: ${x.error}`);
  }
}
lines.push("");
lines.push(
  "Policy: chỉ báo diff — không auto đưa web vào brand-kits. Approver: Vicamed.",
);
console.log(lines.join("\n"));
process.exit(0);
