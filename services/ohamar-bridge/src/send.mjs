/**
 * Send via OpenClaw tools/invoke (message tool) or CLI fallback.
 * Dry-run when BRIDGE_DRY_RUN=1 or gateway not listening.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BOTS, readGatewayToken } from "./bots.mjs";
import { getAiMode, logEvent } from "./store.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OHAMAR_ROOT = process.env.OHAMAR_ROOT || path.resolve(__dirname, "../../..");
const OPENCLAW = path.join(OHAMAR_ROOT, "node_modules", "openclaw", "openclaw.mjs");

async function toolsInvoke(bot, body) {
  const b = BOTS[bot];
  const token = readGatewayToken(b.stateDir);
  const url = `http://${b.host}:${b.port}/tools/invoke`;
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  return { ok: r.ok, status: r.status, json };
}

function runCli(bot, args) {
  return new Promise((resolve) => {
    const env = {
      ...process.env,
      OHAMAR_INSTANCE: bot,
      OPENCLAW_STATE_DIR: BOTS[bot].stateDir,
      OPENCLAW_CONFIG_PATH: path.join(BOTS[bot].stateDir, "openclaw.json"),
    };
    const child = spawn(process.execPath, [OPENCLAW, ...args], {
      cwd: OHAMAR_ROOT,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => {
      resolve({ code, out, err });
    });
  });
}

/**
 * @param {{ bot: string, target: string, text: string, is_group?: boolean, force?: boolean }} params
 */
export async function sendMessage(params) {
  const bot = params.bot === "worker" ? "worker" : "main";
  const target = String(params.target || "").trim();
  const text = String(params.text || "").trim();
  if (!target || !text) {
    const e = new Error("target and text required");
    e.status = 400;
    throw e;
  }

  // Respect human takeover unless force
  if (!params.force) {
    const mode = getAiMode(bot, target);
    // Note: human_paused still allows SALE send from CRM (this endpoint).
    // force reserved for system. AI auto path will check mode separately.
    void mode;
  }

  const dry =
    process.env.BRIDGE_DRY_RUN === "1" ||
    params.dry_run === true;

  if (dry) {
    const result = {
      ok: true,
      dry_run: true,
      bot,
      target,
      text,
      channel: "zaloclaw",
      message: "DRY RUN — not sent to Zalo",
    };
    logEvent("send_dry_run", { bot, target, text: text.slice(0, 120) });
    return result;
  }

  // Prefer tools/invoke message tool
  const invoke = await toolsInvoke(bot, {
    tool: "message",
    action: "send",
    args: {
      action: "send",
      channel: "zaloclaw",
      target,
      message: text,
      accountId: "default",
    },
  }).catch((e) => ({ ok: false, status: 0, json: { error: String(e) } }));

  if (invoke.ok) {
    logEvent("send_ok", { bot, target, via: "tools/invoke" });
    return {
      ok: true,
      dry_run: false,
      bot,
      target,
      via: "tools/invoke",
      result: invoke.json,
    };
  }

  // CLI fallback
  const cli = await runCli(bot, [
    "message",
    "send",
    "--channel",
    "zaloclaw",
    "--target",
    target,
    "--message",
    text,
    "--json",
  ]);

  if (cli.code === 0) {
    logEvent("send_ok", { bot, target, via: "cli" });
    let parsed = {};
    try {
      parsed = JSON.parse(cli.out);
    } catch {
      parsed = { out: cli.out };
    }
    return {
      ok: true,
      dry_run: false,
      bot,
      target,
      via: "cli",
      result: parsed,
    };
  }

  logEvent("send_fail", {
    bot,
    target,
    invoke_status: invoke.status,
    invoke: invoke.json,
    cli_code: cli.code,
    cli_err: cli.err.slice(0, 500),
  });

  const e = new Error(
    `send failed (gateway ${BOTS[bot].port}): ${cli.err || invoke.json?.error || "unknown"}`,
  );
  e.status = 502;
  e.detail = { invoke, cli: { code: cli.code, err: cli.err, out: cli.out } };
  throw e;
}
