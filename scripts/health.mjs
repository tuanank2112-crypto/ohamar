#!/usr/bin/env node
/**
 * Minimal health check:
 *   instance · account · port · credentials · (optional) gateway TCP
 *
 * Exit 0 = healthy, 1 = unhealthy. JSON with --json.
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import {
  BOT_LABEL,
  CONFIG_PATH,
  CREDENTIALS_PATH,
  DEFAULT_PORT,
  INSTANCE,
  IS_WORKER,
  STATE_DIR,
  WORKSPACE,
  isPidAlive,
  loadDotEnv,
  readPidFile,
} from "./env.mjs";

loadDotEnv();

const asJson = process.argv.includes("--json");
const port = Number(process.env.OHAMAR_PORT || DEFAULT_PORT);

function checkPort(p) {
  return new Promise((resolve) => {
    const sock = net.connect({ host: "127.0.0.1", port: p }, () => {
      sock.end();
      resolve(true);
    });
    sock.on("error", () => resolve(false));
    sock.setTimeout(1500, () => {
      sock.destroy();
      resolve(false);
    });
  });
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return null;
  }
}

const cfg = readConfig();
const z = cfg?.channels?.zaloclaw || {};
const account =
  z.accounts?.[z.defaultAccount || "default"] ||
  z.accounts?.default ||
  null;
const accountName = account?.name || null;
const allowFrom = account?.allowFrom || z.allowFrom || [];
const expectedAccount = IS_WORKER ? "Minh Phát Vicamed" : "Gia Huy Vicamed";

const pid = readPidFile();
const pidAlive = pid ? isPidAlive(pid) : false;
const credsOk = fs.existsSync(CREDENTIALS_PATH);
const portOk = await checkPort(port);

// WS/session heuristic: credentials + port open ≈ channel can live
const sessionHeuristic = credsOk && portOk;

const checks = {
  instance: INSTANCE,
  bot: BOT_LABEL,
  stateDir: STATE_DIR,
  workspace: WORKSPACE,
  configExists: Boolean(cfg),
  accountName,
  accountExpected: expectedAccount,
  accountMatch: accountName === expectedAccount,
  allowFrom,
  allowlistOpen: allowFrom.includes("*"),
  port,
  portListening: portOk,
  pid,
  pidAlive,
  credentialsPresent: credsOk,
  credentialsPath: CREDENTIALS_PATH,
  sessionHeuristicOk: sessionHeuristic,
  modelPrimary: cfg?.agents?.defaults?.model?.primary || null,
  thinkingDefault: cfg?.agents?.defaults?.thinkingDefault || null,
};

const failures = [];
if (!checks.configExists) failures.push("config_missing");
if (!checks.accountMatch) failures.push("account_mismatch");
if (checks.allowlistOpen) failures.push("allowlist_open_wildcard");
if (!checks.portListening) failures.push("port_not_listening");
if (!checks.credentialsPresent) failures.push("credentials_missing");
if (checks.pid && !checks.pidAlive) failures.push("stale_pid");
// If port is up but no pid file, warn only
if (checks.portListening && !checks.pidAlive) {
  /* residual openclaw without our pid — still count as up for port */
}

const ok = failures.length === 0;

const report = {
  ok,
  failures,
  checks,
  ts: new Date().toISOString(),
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`🦞 Health — ${BOT_LABEL} (instance=${INSTANCE})`);
  console.log(`   status:     ${ok ? "✓ healthy" : "✗ unhealthy"}`);
  console.log(`   account:    ${accountName || "?"} ${checks.accountMatch ? "✓" : "✗ expected " + expectedAccount}`);
  console.log(`   port ${port}:   ${portOk ? "listening ✓" : "down ✗"}`);
  console.log(`   credentials:${credsOk ? " present ✓" : " missing ✗"}`);
  console.log(`   pid:        ${pid ?? "none"}${pidAlive ? " (alive)" : pid ? " (dead)" : ""}`);
  console.log(`   allowFrom:  ${JSON.stringify(allowFrom)}${checks.allowlistOpen ? " ⚠ wildcard" : ""}`);
  console.log(`   model:      ${checks.modelPrimary} · think ${checks.thinkingDefault}`);
  if (failures.length) console.log(`   failures:   ${failures.join(", ")}`);
}

process.exit(ok ? 0 : 1);
