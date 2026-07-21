import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "..");

function loadEnvFile(p) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

loadEnvFile(path.join(ROOT, ".env"));
// optional shared secrets from ohamar main state
loadEnvFile(path.join(ROOT, "../../data/.env"));

export const HOST = process.env.LEAD_CORE_HOST || "127.0.0.1";
export const PORT = Number(process.env.LEAD_CORE_PORT || 18792);
export const TOKEN = process.env.LEAD_CORE_TOKEN || "";
export const DB_PATH = path.resolve(
  ROOT,
  process.env.LEAD_CORE_DB || "./data/lead.db",
);
export const LEASE_TTL_SEC = Number(process.env.LEAD_CORE_LEASE_TTL_SEC || 45);
export const RETENTION_DAYS = Number(process.env.LEAD_CORE_RETENTION_DAYS || 365);

export const OWNERS = new Set([
  "none",
  "gia_huy",
  "minh_phat",
  "fb_page",
  "human",
]);

export const STATUSES = new Set([
  "NEW",
  "BOT_ACTIVE",
  "WAITING_CONSENT",
  "ASSIGNED",
  "HUMAN_ACTIVE",
  "CLOSED",
]);
