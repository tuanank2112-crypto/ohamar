#!/usr/bin/env node
/**
 * Start Ohamar gateway with process lock + graceful signal handling.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import {
  BOT_LABEL,
  CONFIG_PATH,
  DEFAULT_PORT,
  INSTANCE,
  IS_WORKER,
  OPENCLAW_BIN,
  ROOT,
  STATE_DIR,
  acquireProcessLock,
  assertCredentialsIsolation,
  assertOpenclawInstalled,
  clearPidFile,
  ohamarEnv,
  stripBomFromJsonFile,
  writePidFile,
} from "./env.mjs";
import { relocateOpenclawConfig } from "./relocate-config.mjs";

assertOpenclawInstalled();
if (!fs.existsSync(CONFIG_PATH)) {
  console.error("Chưa setup. Chạy: npm run setup");
  process.exit(1);
}

// Heal BOM + Linux/WSL → Windows path rewrite in openclaw.json
try {
  stripBomFromJsonFile(CONFIG_PATH);
} catch (e) {
  console.error(`❌ openclaw.json invalid JSON: ${e.message}`);
  process.exit(1);
}
relocateOpenclawConfig();

assertCredentialsIsolation();

const force =
  process.env.OHAMAR_FORCE === "1" || process.argv.includes("--force");
const releaseLock = acquireProcessLock({ force });

const port = process.env.OHAMAR_PORT || String(DEFAULT_PORT);
const verbose =
  process.argv.includes("--verbose") || process.argv.includes("-v");

console.log(`🦞 Ohamar gateway`);
console.log(`   bot:      ${BOT_LABEL}`);
console.log(`   instance: ${INSTANCE}`);
console.log(`   port:     ${port}`);
console.log(`   state:    ${STATE_DIR}`);
console.log(`   config:   ${CONFIG_PATH}`);
console.log(`   Ctrl+C / SIGTERM → graceful stop\n`);

const args = ["gateway", "--port", port];
if (verbose) args.push("--verbose");

const child = spawn(process.execPath, [OPENCLAW_BIN, ...args], {
  cwd: ROOT,
  stdio: "inherit",
  env: ohamarEnv(),
});

writePidFile(child.pid);
let shuttingDown = false;

function gracefulStop(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n⏹  ${signal} → graceful shutdown (instance=${INSTANCE})…`);
  try {
    child.kill("SIGTERM");
  } catch {
    /* ignore */
  }
  const killTimer = setTimeout(() => {
    console.warn("⚠️  Graceful timeout — SIGKILL gateway");
    try {
      child.kill("SIGKILL");
    } catch {
      /* ignore */
    }
  }, 15_000);
  killTimer.unref?.();
}

process.on("SIGINT", () => gracefulStop("SIGINT"));
process.on("SIGTERM", () => gracefulStop("SIGTERM"));

child.on("exit", (code, signal) => {
  clearPidFile();
  try {
    releaseLock?.();
  } catch {
    /* ignore */
  }
  if (signal) {
    process.exit(0);
  }
  process.exit(code ?? 0);
});
