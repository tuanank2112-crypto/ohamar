#!/usr/bin/env node
/** Thin root wrapper → services/lead-core outbound gate */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gate = path.join(root, "services/lead-core/src/outbound-gate.mjs");
const r = spawnSync(process.execPath, [gate, ...process.argv.slice(2)], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
process.exit(r.status ?? 1);
