import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OHAMAR_ROOT = process.env.OHAMAR_ROOT || path.resolve(__dirname, "../../..");

export const BOTS = {
  main: {
    id: "main",
    label: "Gia Huy Vicamed",
    port: Number(process.env.OHAMAR_MAIN_PORT || 18789),
    host: process.env.OHAMAR_MAIN_HOST || "127.0.0.1",
    stateDir: path.join(OHAMAR_ROOT, "data"),
  },
  worker: {
    id: "worker",
    label: "Minh Phát Vicamed",
    port: Number(process.env.OHAMAR_WORKER_PORT || 18790),
    host: process.env.OHAMAR_WORKER_HOST || "127.0.0.1",
    stateDir: path.join(OHAMAR_ROOT, "data-worker"),
  },
};

export function readGatewayToken(stateDir) {
  const cfgPath = path.join(stateDir, "openclaw.json");
  try {
    const j = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    return j?.gateway?.auth?.token || process.env.OPENCLAW_GATEWAY_TOKEN || "";
  } catch {
    return process.env.OPENCLAW_GATEWAY_TOKEN || "";
  }
}

function checkPort(host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const sock = net.connect({ host, port }, () => {
      sock.end();
      resolve(true);
    });
    sock.on("error", () => resolve(false));
    sock.setTimeout(timeoutMs, () => {
      sock.destroy();
      resolve(false);
    });
  });
}

export async function botStatus(botId) {
  const b = BOTS[botId];
  if (!b) {
    const e = new Error("unknown bot (main|worker)");
    e.status = 400;
    throw e;
  }
  const listening = await checkPort(b.host, b.port);
  const creds = path.join(b.stateDir, "credentials", "zaloclaw-credentials.json");
  const credentialsPresent = fs.existsSync(creds);
  let accountName = b.label;
  try {
    const cfg = JSON.parse(
      fs.readFileSync(path.join(b.stateDir, "openclaw.json"), "utf8"),
    );
    const z = cfg?.channels?.zaloclaw;
    const acc =
      z?.accounts?.[z.defaultAccount || "default"] || z?.accounts?.default;
    if (acc?.name) accountName = acc.name;
  } catch {
    /* ignore */
  }
  return {
    id: b.id,
    label: b.label,
    account_name: accountName,
    host: b.host,
    port: b.port,
    listening,
    credentials_present: credentialsPresent,
    ok: listening && credentialsPresent,
    channel: "zaloclaw",
  };
}

export async function listBots() {
  const main = await botStatus("main");
  const worker = await botStatus("worker");
  return {
    bots: [main, worker],
    dry_run: process.env.BRIDGE_DRY_RUN === "1",
    ohamar_root: OHAMAR_ROOT,
  };
}
