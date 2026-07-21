/**
 * Shared env for Ohamar — isolates OpenClaw state under ./data or ./data-worker
 * so it never collides with a global ~/.openclaw install or the sibling instance.
 *
 * Instance (required for production scripts):
 *   OHAMAR_INSTANCE=main|worker
 * Legacy alias "default" → main (with warning). Unset only allowed when
 * OHAMAR_ALLOW_UNSET_INSTANCE=1 (dev); otherwise scripts set it explicitly.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "..");

const rawInstance = (process.env.OHAMAR_INSTANCE || "").trim().toLowerCase();
const ALLOW_UNSET = process.env.OHAMAR_ALLOW_UNSET_INSTANCE === "1";

function resolveInstance(raw) {
  if (!raw || raw === "default") {
    if (!raw && !ALLOW_UNSET) {
      // Soft default for ad-hoc node scripts, but warn loudly.
      console.warn(
        "⚠️  OHAMAR_INSTANCE unset — assuming main. " +
          "Production: set OHAMAR_INSTANCE=main|worker (npm scripts do this).",
      );
    } else if (raw === "default") {
      console.warn('⚠️  OHAMAR_INSTANCE=default is legacy; prefer OHAMAR_INSTANCE=main');
    }
    return "main";
  }
  if (raw === "main" || raw === "worker") return raw;
  console.error(
    `❌ OHAMAR_INSTANCE="${raw}" invalid. Use main | worker`,
  );
  process.exit(1);
}

export const INSTANCE = resolveInstance(rawInstance);
export const IS_WORKER = INSTANCE === "worker";
export const BOT_LABEL = IS_WORKER ? "Minh Phát (worker)" : "Gia Huy (main)";

export const STATE_DIR = path.join(ROOT, IS_WORKER ? "data-worker" : "data");
export const SIBLING_STATE_DIR = path.join(
  ROOT,
  IS_WORKER ? "data" : "data-worker",
);
export const WORKSPACE = path.join(
  ROOT,
  IS_WORKER ? "workspace-worker" : "workspace",
);
export const SIBLING_WORKSPACE = path.join(
  ROOT,
  IS_WORKER ? "workspace" : "workspace-worker",
);
export const CONFIG_PATH = path.join(STATE_DIR, "openclaw.json");
export const ENV_PATH = path.join(STATE_DIR, ".env");
export const PID_PATH = path.join(STATE_DIR, "ohamar-gateway.pid");
export const LOCK_PATH = path.join(STATE_DIR, "ohamar-gateway.lock");
export const CREDENTIALS_DIR = path.join(STATE_DIR, "credentials");
export const CREDENTIALS_PATH = path.join(
  CREDENTIALS_DIR,
  "zaloclaw-credentials.json",
);
export const ZALOCLAW = path.join(ROOT, "vendor", "zaloclaw");
export const OPENCLAW_BIN = path.join(
  ROOT,
  "node_modules",
  "openclaw",
  "openclaw.mjs",
);
export const DEFAULT_PORT = IS_WORKER ? 18790 : 18789;
export const OWNER_ZALO_ID = "5139686145106992704";

export function ensureDirs() {
  for (const d of [
    STATE_DIR,
    WORKSPACE,
    path.join(WORKSPACE, "skills"),
    path.join(STATE_DIR, "agents"),
    CREDENTIALS_DIR,
    path.join(STATE_DIR, "locks"),
    path.join(STATE_DIR, "alerts"),
  ]) {
    fs.mkdirSync(d, { recursive: true });
  }
}

export function loadDotEnv() {
  if (!fs.existsSync(ENV_PATH)) return;
  const text = fs.readFileSync(ENV_PATH, "utf8");
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

/**
 * Fail-closed credential checks:
 * - credentials must live under this instance STATE_DIR only
 * - no symlink into sibling instance or ~/.openclaw
 * - refuse legacy zaloclaw-credentials-worker.json for main default path
 */
export function assertCredentialsIsolation() {
  ensureDirs();
  const badNames = IS_WORKER
    ? []
    : ["zaloclaw-credentials-worker.json"];

  for (const name of badNames) {
    const p = path.join(CREDENTIALS_DIR, name);
    if (fs.existsSync(p)) {
      console.error(
        `❌ Legacy credential file present (fail-closed): ${p}\n` +
          `   Move to archive (npm run cleanup:legacy) — worker uses data-worker/ only.`,
      );
      process.exit(1);
    }
  }

  if (!fs.existsSync(CREDENTIALS_PATH)) return;

  try {
    const real = fs.realpathSync(CREDENTIALS_PATH);
    const stateReal = fs.realpathSync(STATE_DIR);
    if (!real.startsWith(stateReal + path.sep) && real !== stateReal) {
      console.error(
        `❌ Credential path escapes state dir (fail-closed):\n` +
          `   file: ${real}\n   state: ${stateReal}`,
      );
      process.exit(1);
    }
    // Block symlink into sibling
    const siblingReal = fs.existsSync(SIBLING_STATE_DIR)
      ? fs.realpathSync(SIBLING_STATE_DIR)
      : SIBLING_STATE_DIR;
    if (real.startsWith(siblingReal + path.sep)) {
      console.error(
        `❌ Credentials resolve into sibling instance (fail-closed): ${real}`,
      );
      process.exit(1);
    }
  } catch (err) {
    console.error(`❌ Credential isolation check failed: ${err.message}`);
    process.exit(1);
  }
}

/** Build process env for all openclaw invocations. */
export function ohamarEnv(extra = {}) {
  ensureDirs();
  loadDotEnv();
  // Explicit instance so child processes never "guess" main from unset.
  return {
    ...process.env,
    OHAMAR_INSTANCE: INSTANCE,
    OPENCLAW_STATE_DIR: STATE_DIR,
    OPENCLAW_CONFIG_PATH: CONFIG_PATH,
    // Fail-closed for zaloclaw: never fall back to ~/.openclaw when set
    OHAMAR_CREDENTIALS_FAIL_CLOSED: "1",
    ...extra,
  };
}

export function assertOpenclawInstalled() {
  if (!fs.existsSync(OPENCLAW_BIN)) {
    console.error(
      "❌ openclaw chưa được cài. Chạy: npm install\n" +
        `   (expected: ${OPENCLAW_BIN})`,
    );
    process.exit(1);
  }
}

export function isPidAlive(pid) {
  if (!pid || !Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function readPidFile() {
  if (!fs.existsSync(PID_PATH)) return null;
  try {
    const raw = fs.readFileSync(PID_PATH, "utf8").trim();
    const pid = Number(raw);
    return Number.isFinite(pid) ? pid : null;
  } catch {
    return null;
  }
}

export function writePidFile(pid) {
  ensureDirs();
  fs.writeFileSync(PID_PATH, String(pid) + "\n", { mode: 0o600 });
}

export function clearPidFile() {
  try {
    if (fs.existsSync(PID_PATH)) fs.unlinkSync(PID_PATH);
  } catch {
    /* ignore */
  }
  try {
    if (fs.existsSync(LOCK_PATH)) fs.unlinkSync(LOCK_PATH);
  } catch {
    /* ignore */
  }
}

/**
 * Exclusive process lock for one instance. Returns unlock() or exits if held.
 */
export function acquireProcessLock({ force = false } = {}) {
  ensureDirs();
  const existing = readPidFile();
  if (existing && isPidAlive(existing) && existing !== process.pid) {
    if (!force) {
      console.error(
        `❌ Gateway already running for instance=${INSTANCE} (pid ${existing}).\n` +
          `   Stop first: npm run ${IS_WORKER ? "stop:worker" : "stop"}\n` +
          `   Or force: OHAMAR_FORCE=1 npm run ${IS_WORKER ? "start:worker" : "start"}`,
      );
      process.exit(1);
    }
    console.warn(`⚠️  Force: sending SIGTERM to pid ${existing}`);
    try {
      process.kill(existing, "SIGTERM");
    } catch {
      /* ignore */
    }
  }

  // File lock via O_EXCL when possible
  try {
    const fd = fs.openSync(LOCK_PATH, "wx", 0o600);
    fs.writeFileSync(fd, `${process.pid}\n${INSTANCE}\n${Date.now()}\n`);
    fs.closeSync(fd);
  } catch (err) {
    if (err.code === "EEXIST" && !force) {
      const stale = readPidFile();
      if (stale && isPidAlive(stale)) {
        console.error(
          `❌ Lock held for instance=${INSTANCE}. Stop existing gateway first.`,
        );
        process.exit(1);
      }
      // Stale lock
      try {
        fs.unlinkSync(LOCK_PATH);
      } catch {
        /* ignore */
      }
      return acquireProcessLock({ force });
    }
    if (err.code === "EEXIST" && force) {
      try {
        fs.unlinkSync(LOCK_PATH);
      } catch {
        /* ignore */
      }
      return acquireProcessLock({ force: false });
    }
  }

  writePidFile(process.pid);
  return () => clearPidFile();
}

export function portInUse(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(true));
    server.once("listening", () => {
      server.close(() => resolve(false));
    });
    server.listen(port, "127.0.0.1");
  });
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function appendAlert(message, extra = {}) {
  ensureDirs();
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    instance: INSTANCE,
    message,
    ...extra,
  });
  fs.appendFileSync(path.join(STATE_DIR, "alerts", "alerts.jsonl"), line + "\n");
}
