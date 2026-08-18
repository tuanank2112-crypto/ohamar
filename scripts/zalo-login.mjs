#!/usr/bin/env node
/**
 * QR login / re-login for Zalo personal account via zaloclaw plugin.
 * Use when session expires, zpw_sek invalid, or bot stops receiving Zalo messages.
 *
 *   npm run zalo:login           # main (Gia Huy) → data/
 *   npm run zalo:login:worker    # worker (Minh Phát) → data-worker/
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  BOT_LABEL,
  DEFAULT_PORT,
  INSTANCE,
  IS_WORKER,
  OPENCLAW_BIN,
  ROOT,
  STATE_DIR,
  assertOpenclawInstalled,
  ohamarEnv,
} from "./env.mjs";

assertOpenclawInstalled();

const START_CMD = IS_WORKER ? "npm run start:worker" : "npm run start";
const STOP_CMD = IS_WORKER ? "npm run stop:worker" : "npm run stop";
const LOGIN_CMD = IS_WORKER ? "npm run zalo:login:worker" : "npm run zalo:login";

const credPath = path.join(STATE_DIR, "credentials", "zaloclaw-credentials.json");
const legacyPath = path.join(
  process.env.HOME || "",
  ".openclaw",
  "zaloclaw-credentials.json",
);

// Clear broken sessions so QR is forced (zpw_sek invalid → silent fail)
for (const p of [credPath, legacyPath]) {
  if (fs.existsSync(p)) {
    const bak = `${p}.bak.${Date.now()}`;
    fs.renameSync(p, bak);
    console.log(`• Moved old session → ${bak}`);
  }
}

console.log(`
📱 Ohamar — Zalo QR login / re-login

   Bot:      ${BOT_LABEL}
   Instance: ${IS_WORKER ? "worker" : "main/default"}
   State:    ${STATE_DIR}
   Port:     ${DEFAULT_PORT}
   Session:  ${credPath}

   Khi nào chạy lại:
   • Bot không nhận / không gửi được tin Zalo
   • Log báo session / zpw_sek invalid / auth fail
   • Đổi máy / mất file credentials

   Các bước:
   1. (Khuyến nghị) dừng gateway: ${STOP_CMD}
   2. Terminal hiện mã QR
   3. Mở Zalo app (đúng acc BOT) → Trang cá nhân → icon QR → quét
   4. Session mới ghi vào: ${credPath}
   5. Restart gateway: ${START_CMD}
   6. Nhắn thử 1 tin từ acc owner → bot trên Zalo
`);

const r = spawnSync(
  process.execPath,
  [OPENCLAW_BIN, "channels", "login", "--channel", "zaloclaw"],
  {
    cwd: ROOT,
    stdio: "inherit",
    env: ohamarEnv(),
  },
);

if ((r.status ?? 1) === 0 && fs.existsSync(credPath)) {
  console.log(`
✓ Session saved: ${credPath}
→ Restart gateway: ${START_CMD}
→ Rồi nhắn thử từ Zalo owner → ${IS_WORKER ? "Minh Phát" : "Gia Huy"}
`);
} else if ((r.status ?? 1) !== 0) {
  console.error(`
✗ Login failed / cancelled.
→ Chạy lại: ${LOGIN_CMD}
→ Đảm bảo quét đúng acc bot (${BOT_LABEL})
`);
}

process.exit(r.status ?? 0);
