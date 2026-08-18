#!/usr/bin/env node
/**
 * Print Control UI URL with gateway token (Ohamar uses `npm run start`, not
 * systemd install). Avoids "Gateway is not installed" interactive install.
 */
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import {
  CONFIG_PATH,
  OPENCLAW_BIN,
  ROOT,
  assertOpenclawInstalled,
  ohamarEnv,
} from "./env.mjs";

assertOpenclawInstalled();

const env = ohamarEnv();
let token = env.OPENCLAW_GATEWAY_TOKEN || "";
try {
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  token = cfg?.gateway?.auth?.token || token;
} catch {
  /* ignore */
}

const url = token
  ? `http://127.0.0.1:18789/#token=${token}`
  : "http://127.0.0.1:18789/";

console.log(`
🦞 Ohamar Control UI

1) Bật gateway (terminal khác, nếu chưa):
   cd ~/ohamar && npm run start

2) Mở trình duyệt:
   ${url}

Nếu "Cannot receive messages" / token mismatch:
   - Dán đúng URL có #token=... ở trên
   - Hoặc xóa Local Storage của 127.0.0.1:18789 rồi mở lại URL

Không cần trả lời Y/n "Install gateway" — Ohamar chạy bằng npm run start.
`);

// Best-effort: openclaw dashboard --no-open (may warn if unmanaged)
const r = spawnSync(
  process.execPath,
  [OPENCLAW_BIN, "dashboard", "--no-open"],
  { cwd: ROOT, stdio: "inherit", env },
);
// Don't fail hard on openclaw's "not installed" — URL above is enough
process.exit(0);
