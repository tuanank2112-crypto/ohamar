import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "..");
export const OHAMAR_ROOT = path.resolve(
  process.env.OHAMAR_ROOT || path.join(ROOT, "../.."),
);

function loadEnv(p) {
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

loadEnv(path.join(ROOT, ".env"));
loadEnv(path.join(OHAMAR_ROOT, "services/lead-core/.env"));
loadEnv(path.join(OHAMAR_ROOT, "data/.env"));

export const HOST = process.env.FB_MESSENGER_HOST || "127.0.0.1";
export const PORT = Number(process.env.FB_MESSENGER_PORT || 18793);
export const VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN || "";
export const PAGE_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN || "";
export const APP_SECRET = process.env.FB_APP_SECRET || "";
export const PAGE_ID = process.env.FB_PAGE_ID || "";
export const LEAD_URL = (
  process.env.LEAD_CORE_URL || "http://127.0.0.1:18792"
).replace(/\/$/, "");
export const LEAD_TOKEN = process.env.LEAD_CORE_TOKEN || "";
export const AUTO_REPLY = (process.env.FB_AUTO_REPLY || "safe_faq").toLowerCase();
export const BRAND_KITS = path.resolve(
  OHAMAR_ROOT,
  process.env.BRAND_KITS || "workspace/brand-kits/vicamed",
);
