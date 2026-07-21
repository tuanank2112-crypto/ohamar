#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { OPENCLAW_BIN, ROOT, assertOpenclawInstalled, ohamarEnv } from "./env.mjs";

assertOpenclawInstalled();
const message = process.argv.slice(2).join(" ").trim();
if (!message) {
  console.error('Usage: npm run agent -- "Your message here"');
  process.exit(1);
}
const r = spawnSync(
  process.execPath,
  [OPENCLAW_BIN, "agent", "--message", message],
  {
    cwd: ROOT,
    stdio: "inherit",
    env: ohamarEnv(),
  },
);
process.exit(r.status ?? 0);
