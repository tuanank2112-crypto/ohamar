#!/usr/bin/env node
/**
 * Expand clinical case folders from sheet tab 09 → case YAML cards.
 *
 * Usage:
 *   npm run cards:cases -- /path/to/Database_Chatbot.xlsx
 *   npm run cards:cases -- /path/to.xlsx --brand vicamed
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);

if (args.length === 0 || args[0] === "-h" || args[0] === "--help") {
  console.log(`Usage:
  npm run cards:cases -- <file.xlsx> [--brand vicamed]

Option B: sheet keeps Drive folders; this expands children → brand-kits/<brand>/cases/
`);
  process.exit(args.length === 0 ? 1 : 0);
}

const xlsx = resolve(args[0]);
if (!existsSync(xlsx)) {
  console.error(`File not found: ${xlsx}`);
  process.exit(1);
}

const r = spawnSync(
  "python3",
  ["scripts/expand-clinical-case-folders.py", xlsx, ...args.slice(1)],
  { cwd: root, stdio: "inherit" },
);
process.exit(r.status ?? 1);
