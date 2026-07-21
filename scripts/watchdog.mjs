#!/usr/bin/env node
/**
 * Watch one instance; append alerts + optional notify when unhealthy.
 *
 *   OHAMAR_INSTANCE=main npm run watchdog
 *   OHAMAR_INSTANCE=worker npm run watchdog:worker
 *
 * Env:
 *   OHAMAR_WATCHDOG_INTERVAL_SEC=60
 *   OHAMAR_WATCHDOG_FAILS=2          # consecutive fails before alert
 *   OHAMAR_ALERT_CMD='…'            # shell command on alert (optional)
 *   OHAMAR_ALERT_TO=zaloUserId      # logged / passed to alert cmd
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  BOT_LABEL,
  INSTANCE,
  OWNER_ZALO_ID,
  ROOT,
  STATE_DIR,
  appendAlert,
  ensureDirs,
  loadDotEnv,
  sleep,
} from "./env.mjs";

loadDotEnv();
ensureDirs();

const intervalSec = Number(process.env.OHAMAR_WATCHDOG_INTERVAL_SEC || 60);
const needFails = Number(process.env.OHAMAR_WATCHDOG_FAILS || 2);
const alertTo = process.env.OHAMAR_ALERT_TO || OWNER_ZALO_ID;
const alertCmd = process.env.OHAMAR_ALERT_CMD || "";
const once = process.argv.includes("--once");

let consecutive = 0;
let lastAlertAt = 0;
const ALERT_COOLDOWN_MS = 15 * 60 * 1000;

function runHealth() {
  const r = spawnSync(
    process.execPath,
    [path.join(ROOT, "scripts", "health.mjs"), "--json"],
    {
      cwd: ROOT,
      env: { ...process.env, OHAMAR_INSTANCE: INSTANCE },
      encoding: "utf8",
    },
  );
  try {
    return JSON.parse(r.stdout || "{}");
  } catch {
    return { ok: false, failures: ["health_parse_error"], raw: r.stdout };
  }
}

function notify(report) {
  const msg =
    `[Ohamar ALERT] ${BOT_LABEL} unhealthy ` +
    `failures=${(report.failures || []).join(",") || "unknown"} ` +
    `to=${alertTo}`;
  appendAlert(msg, { failures: report.failures, checks: report.checks });
  console.error(`🚨 ${msg}`);

  if (alertCmd) {
    const env = {
      ...process.env,
      OHAMAR_ALERT_MESSAGE: msg,
      OHAMAR_ALERT_TO: alertTo,
      OHAMAR_ALERT_INSTANCE: INSTANCE,
      OHAMAR_ALERT_JSON: JSON.stringify(report),
    };
    const r = spawnSync("bash", ["-lc", alertCmd], {
      cwd: ROOT,
      env,
      stdio: "inherit",
    });
    if ((r.status ?? 1) !== 0) {
      console.warn("⚠️  OHAMAR_ALERT_CMD exited non-zero");
    }
  } else {
    // Default: also drop a stamp file for external monitors
    fs.writeFileSync(
      path.join(STATE_DIR, "alerts", "last-alert.json"),
      JSON.stringify(
        { ts: new Date().toISOString(), message: msg, report },
        null,
        2,
      ),
    );
    console.log(
      "   (set OHAMAR_ALERT_CMD in .env to push Zalo/Telegram/etc.)",
    );
  }
}

console.log(
  `👁  Watchdog ${BOT_LABEL} every ${intervalSec}s (alert after ${needFails} fails)`,
);

async function tick() {
  const report = runHealth();
  if (report.ok) {
    if (consecutive > 0) {
      console.log(`✓ recovered after ${consecutive} fail(s)`);
      appendAlert("recovered", { previousFails: consecutive });
    }
    consecutive = 0;
    return;
  }
  consecutive++;
  console.warn(
    `✗ unhealthy (${consecutive}/${needFails}): ${(report.failures || []).join(", ")}`,
  );
  if (consecutive >= needFails && Date.now() - lastAlertAt > ALERT_COOLDOWN_MS) {
    notify(report);
    lastAlertAt = Date.now();
  }
}

if (once) {
  await tick();
  process.exit(consecutive >= needFails ? 1 : 0);
}

while (true) {
  await tick();
  await sleep(intervalSec * 1000);
}
