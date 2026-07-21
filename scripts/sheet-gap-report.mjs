#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const xlsx = process.argv[2];
if (!xlsx) { console.error("Usage: node scripts/sheet-gap-report.mjs /path/to.xlsx"); process.exit(2); }
const r = spawnSync("python3", [path.join(__dirname, "sheet-gap-report.py"), xlsx], { stdio: "inherit" });
process.exit(r.status ?? 1);

