#!/usr/bin/env node
/**
 * Start Lead Core + both Ohamar gateways (feature/lead-core-vicamed-watch).
 * Logs under /tmp/ohamar-*.log
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leadEnv = path.join(ROOT, "services/lead-core/.env");
if (!fs.existsSync(leadEnv)) {
  console.error("Missing services/lead-core/.env — copy from .env.example");
  process.exit(1);
}

function start(name, command, args, logFile) {
  const out = fs.openSync(logFile, "a");
  fs.writeSync(out, `\n--- start ${name} ${new Date().toISOString()} ---\n`);
  const child = spawn(command, args, {
    cwd: ROOT,
    env: process.env,
    detached: true,
    stdio: ["ignore", out, out],
  });
  child.unref();
  console.log(`✓ ${name} pid=${child.pid} → ${logFile}`);
  return child.pid;
}

const withFb = process.argv.includes("--fb");

console.log(
  "🦞 Ohamar stack: Lead Core + main + worker" +
    (withFb ? " + FB Messenger" : ""),
);
start(
  "lead-core",
  process.execPath,
  [path.join(ROOT, "services/lead-core/src/server.mjs")],
  "/tmp/ohamar-lead-core.log",
);
await new Promise((r) => setTimeout(r, 1000));
start("main", "npm", ["run", "start"], "/tmp/ohamar-main.log");
start("worker", "npm", ["run", "start:worker"], "/tmp/ohamar-worker.log");

if (withFb) {
  const fbEnv = path.join(ROOT, "services/fb-messenger/.env");
  if (!fs.existsSync(fbEnv)) {
    console.warn("⚠️  services/fb-messenger/.env missing — skip FB");
  } else {
    start(
      "fb-messenger",
      process.execPath,
      [path.join(ROOT, "services/fb-messenger/src/server.mjs")],
      "/tmp/ohamar-fb.log",
    );
  }
}

console.log(`
Check:
  curl -s http://127.0.0.1:18792/v1/health
  sleep 3 && npm run health && npm run health:worker
  ${withFb ? "curl -s http://127.0.0.1:18793/health" : "FB: npm run stack:start -- --fb"}
`);
