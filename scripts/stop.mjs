#!/usr/bin/env node
/**
 * Graceful stop: prefer our pid file, then openclaw gateway stop.
 */
import { spawnSync } from "node:child_process";
import {
  BOT_LABEL,
  INSTANCE,
  OPENCLAW_BIN,
  ROOT,
  assertOpenclawInstalled,
  clearPidFile,
  isPidAlive,
  ohamarEnv,
  readPidFile,
} from "./env.mjs";

assertOpenclawInstalled();

const pid = readPidFile();
console.log(`🦞 Stopping ${BOT_LABEL} (instance=${INSTANCE})…`);

if (pid && isPidAlive(pid)) {
  console.log(`   SIGTERM → pid ${pid}`);
  try {
    process.kill(pid, "SIGTERM");
  } catch (err) {
    console.warn(`   kill failed: ${err.message}`);
  }
  // Wait up to 15s
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline && isPidAlive(pid)) {
    spawnSync("sleep", ["0.2"]);
  }
  if (isPidAlive(pid)) {
    console.warn(`   still alive — SIGKILL pid ${pid}`);
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* ignore */
    }
  }
} else if (pid) {
  console.log(`   stale pid file (${pid}) — cleaning`);
}

// Also ask openclaw to stop any residual gateway for this state dir
const r = spawnSync(process.execPath, [OPENCLAW_BIN, "gateway", "stop"], {
  cwd: ROOT,
  stdio: "inherit",
  env: ohamarEnv(),
});

clearPidFile();
console.log(`✓ Stopped instance=${INSTANCE}`);
process.exit(r.status ?? 0);
