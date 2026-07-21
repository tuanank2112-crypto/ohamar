#!/usr/bin/env node
/**
 * Register Vicamed watch cron jobs on OpenClaw main gateway.
 * Requires gateway running + LEAD_CORE up for watch itself.
 *
 *   node services/lead-core/src/register-cron.mjs
 *   node services/lead-core/src/register-cron.mjs --to 5139686145106992704
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ohamarRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const openclaw = path.join(ohamarRoot, "node_modules/openclaw/openclaw.mjs");

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return def;
  return process.argv[i + 1] ?? def;
}

const to = arg("to", process.env.VICAMED_WATCH_TO || "5139686145106992704");
const name = "vicamed-web-watch";
const cmd = "node services/lead-core/src/watch-cron.mjs";

const env = {
  ...process.env,
  OHAMAR_INSTANCE: "main",
  OPENCLAW_STATE_DIR: path.join(ohamarRoot, "data"),
  OPENCLAW_CONFIG_PATH: path.join(ohamarRoot, "data/openclaw.json"),
};

// Remove existing same-name jobs (best effort via list)
const list = spawnSync(
  process.execPath,
  [openclaw, "cron", "list", "--json"],
  { cwd: ohamarRoot, env, encoding: "utf8" },
);
if (list.status === 0 && list.stdout) {
  try {
    const jobs = JSON.parse(list.stdout);
    const arr = Array.isArray(jobs) ? jobs : jobs.jobs || [];
    for (const j of arr) {
      if (j.name === name || j.displayName === name) {
        console.log("rm existing", j.id || j.jobId);
        spawnSync(
          process.execPath,
          [openclaw, "cron", "rm", j.id || j.jobId],
          { cwd: ohamarRoot, env, stdio: "inherit" },
        );
      }
    }
  } catch {
    /* ignore parse */
  }
}

const args = [
  openclaw,
  "cron",
  "add",
  "--name",
  name,
  "--cron",
  "0 9,17 * * *",
  "--tz",
  "Asia/Ho_Chi_Minh",
  "--command",
  cmd,
  "--command-cwd",
  ohamarRoot,
  "--session",
  "isolated",
  "--agent",
  "main",
  "--announce",
  "--channel",
  "zaloclaw",
  "--to",
  to,
  "--best-effort-deliver",
  "--description",
  "Vicamed website hash watch (09:00+17:00 ICT); NO_REPLY if unchanged",
  "--json",
];

console.log("Registering cron:", name, "→", to);
const r = spawnSync(process.execPath, args, {
  cwd: ohamarRoot,
  env,
  encoding: "utf8",
});
console.log(r.stdout || "");
if (r.stderr) console.error(r.stderr);
if (r.status !== 0) {
  console.error("cron add failed — is main gateway running? npm run start");
  process.exit(r.status ?? 1);
}
console.log("✓ cron registered. List: npm run cli -- cron list");
