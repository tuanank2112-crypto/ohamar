#!/usr/bin/env node
/**
 * Ohamar CLI — thin branded wrapper around OpenClaw + ZaloClaw.
 * Usage: ohamar <setup|start|stop|status|dashboard|zalo:login|agent|doctor|...>
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const map = {
  setup: "scripts/setup.mjs",
  start: "scripts/start.mjs",
  stop: "scripts/stop.mjs",
  status: "scripts/status.mjs",
  dashboard: "scripts/dashboard.mjs",
  "zalo:login": "scripts/zalo-login.mjs",
  "zalo-login": "scripts/zalo-login.mjs",
  agent: "scripts/agent.mjs",
  doctor: "scripts/doctor.mjs",
  help: null,
};

const cmd = process.argv[2] ?? "help";
const rest = process.argv.slice(3);

if (cmd === "help" || cmd === "-h" || cmd === "--help") {
  console.log(`
🦞 Ohamar — Personal AI Assistant (local)

  npm run setup          First-time setup (config + link Zalo plugin)
  npm run start          Start gateway (foreground)
  npm run stop           Stop gateway
  npm run status         Gateway status
  npm run dashboard      Open Control UI
  npm run zalo:login     QR login Zalo personal account
  npm run agent -- "msg" Talk to the agent
  npm run doctor         Diagnose config/runtime
  npm run cli -- <args>  Passthrough to openclaw CLI

State dir:  ${path.join(root, "data")}
Workspace:  ${path.join(root, "workspace")}
Docs:       README.md
`);
  process.exit(0);
}

const script = map[cmd];
if (script) {
  const child = spawn(process.execPath, [path.join(root, script), ...rest], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  child.on("exit", (code) => process.exit(code ?? 0));
} else {
  // Unknown → openclaw passthrough
  const child = spawn(process.execPath, [path.join(root, "scripts/cli.mjs"), cmd, ...rest], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  child.on("exit", (code) => process.exit(code ?? 0));
}
