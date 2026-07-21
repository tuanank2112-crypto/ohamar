#!/usr/bin/env node
/**
 * One-shot: gap (optional) → export product cards from xlsx → validate.
 *
 * Usage:
 *   node scripts/cards-export.mjs /path/to/Database_Chatbot.xlsx
 *   npm run cards:export -- /path/to/file.xlsx
 *   npm run cards:export -- /path/to/file.xlsx --brand vicamed
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);

if (args.length === 0 || args[0] === "-h" || args[0] === "--help") {
  console.log(`Usage:
  npm run cards:export -- <file.xlsx> [--brand vicamed] [--channel zalo] [--gap]

Export approved-only product/price cards, then validate schema.
`);
  process.exit(args.length === 0 ? 1 : 0);
}

const xlsx = resolve(args[0]);
const rest = args.slice(1);
const wantGap = rest.includes("--gap");
const exportArgs = rest.filter((a) => a !== "--gap");

if (!existsSync(xlsx)) {
  console.error(`File not found: ${xlsx}`);
  process.exit(1);
}

function run(cmd, cmdArgs, label) {
  console.log(`\n→ ${label}`);
  const r = spawnSync(cmd, cmdArgs, { cwd: root, stdio: "inherit", encoding: "utf8" });
  if (r.status !== 0) {
    console.error(`FAILED: ${label} (exit ${r.status ?? "null"})`);
    process.exit(r.status ?? 1);
  }
}

if (wantGap) {
  run("python3", ["scripts/sheet-gap-report.py", xlsx], "gap report");
}

run(
  "python3",
  ["scripts/export-product-cards.py", xlsx, ...exportArgs],
  "export product cards",
);

const brandIdx = exportArgs.indexOf("--brand");
const brand = brandIdx >= 0 ? exportArgs[brandIdx + 1] : "vicamed";
run(
  "node",
  ["scripts/validate-product-cards.mjs", "--brand", brand],
  `validate brand=${brand}`,
);

console.log("\nOK cards:export finished.");
