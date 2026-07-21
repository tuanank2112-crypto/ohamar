#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  BOT_LABEL,
  DEFAULT_PORT,
  INSTANCE,
  OPENCLAW_BIN,
  ROOT,
  STATE_DIR,
  assertOpenclawInstalled,
  isPidAlive,
  ohamarEnv,
  readPidFile,
} from "./env.mjs";

assertOpenclawInstalled();
const pid = readPidFile();
console.log(`🦞 Ohamar status — ${BOT_LABEL}`);
console.log(`   instance: ${INSTANCE}`);
console.log(`   state:    ${STATE_DIR}`);
console.log(`   port:     ${DEFAULT_PORT}`);
console.log(
  `   pid:      ${pid ?? "none"}${pid && isPidAlive(pid) ? " (alive)" : pid ? " (dead)" : ""}\n`,
);
const r = spawnSync(process.execPath, [OPENCLAW_BIN, "gateway", "status"], {
  cwd: ROOT,
  stdio: "inherit",
  env: ohamarEnv(),
});
process.exit(r.status ?? 0);
