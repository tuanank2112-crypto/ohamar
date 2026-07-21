#!/usr/bin/env node
/**
 * Ohamar first-time setup:
 * 1. Create isolated data/ + workspace/
 * 2. Write openclaw.json (branded defaults + Zalo channel)
 * 3. Install zaloclaw plugin via --link
 * 4. Seed SOUL/AGENTS workspace files
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  CONFIG_PATH,
  ENV_PATH,
  OPENCLAW_BIN,
  ROOT,
  STATE_DIR,
  WORKSPACE,
  ZALOCLAW,
  assertOpenclawInstalled,
  ensureDirs,
  ohamarEnv,
} from "./env.mjs";

assertOpenclawInstalled();
ensureDirs();

// --- .env template ---
if (!fs.existsSync(ENV_PATH)) {
  fs.writeFileSync(
    ENV_PATH,
    `# Ohamar secrets (trusted by OpenClaw — lives in state dir)
# Uncomment and fill at least one provider key:

# ANTHROPIC_API_KEY=sk-ant-...
# OPENAI_API_KEY=sk-...
# GOOGLE_API_KEY=...
# OPENROUTER_API_KEY=sk-or-...
# XAI_API_KEY=xai-...

# Optional gateway token for remote Control UI
# OPENCLAW_GATEWAY_TOKEN=
`,
    "utf8",
  );
  console.log(`✓ Created ${ENV_PATH}`);
}

// --- default config (minimal valid schema — zaloclaw channel added AFTER plugin link) ---
const defaultConfig = {
  agents: {
    defaults: {
      workspace: WORKSPACE,
      model: {
        primary: "anthropic/claude-sonnet-4-6",
      },
    },
  },
  gateway: {
    port: 18789,
    mode: "local",
    controlUi: {
      enabled: true,
    },
  },
};

// Always (re)write a known-good base if missing OR if previous setup left invalid keys
let needWrite = !fs.existsSync(CONFIG_PATH);
if (!needWrite) {
  try {
    const cur = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    if (cur.agent !== undefined) needWrite = true; // legacy invalid root key
  } catch {
    needWrite = true;
  }
}
if (needWrite && !fs.existsSync(CONFIG_PATH + ".bak") && fs.existsSync(CONFIG_PATH)) {
  fs.copyFileSync(CONFIG_PATH, CONFIG_PATH + ".bak");
}
if (needWrite) {
  // Merge preserve existing non-conflicting keys when re-writing invalid config
  let merged = defaultConfig;
  if (fs.existsSync(CONFIG_PATH + ".bak") || fs.existsSync(CONFIG_PATH)) {
    try {
      const old = JSON.parse(
        fs.readFileSync(fs.existsSync(CONFIG_PATH) ? CONFIG_PATH : CONFIG_PATH + ".bak", "utf8"),
      );
      delete old.agent;
      merged = {
        ...defaultConfig,
        ...old,
        agents: {
          ...defaultConfig.agents,
          ...(old.agents || {}),
          defaults: {
            ...defaultConfig.agents.defaults,
            ...(old.agents?.defaults || {}),
            model: old.agents?.defaults?.model || defaultConfig.agents.defaults.model,
            workspace: WORKSPACE,
          },
        },
        gateway: { ...defaultConfig.gateway, ...(old.gateway || {}) },
      };
      // Drop channel/plugin refs until after link (re-added below)
      delete merged.channels;
      delete merged.plugins;
    } catch {
      /* use default */
    }
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2) + "\n", "utf8");
  console.log(`✓ Wrote ${CONFIG_PATH}`);
} else {
  console.log(`• Config exists, keep: ${CONFIG_PATH}`);
}

// --- workspace identity ---
const soul = path.join(WORKSPACE, "SOUL.md");
const agents = path.join(WORKSPACE, "AGENTS.md");
const tools = path.join(WORKSPACE, "TOOLS.md");

if (!fs.existsSync(soul)) {
  fs.writeFileSync(
    soul,
    `# Ohamar

Bạn là **Ohamar** — trợ lý AI cá nhân chạy local, ưu tiên tiếng Việt.

## Tính cách
- Thẳng thắn, hữu ích, ngắn gọn khi cần, chi tiết khi được hỏi.
- Tôn trọng quyền riêng tư: mọi thứ chạy trên máy người dùng.
- Khi chat Zalo: lịch sự, tự nhiên, tránh spam / over-reply.

## Ranh giới
- Không thực thi lệnh nguy hiểm nếu không được xác nhận rõ.
- Không chia sẻ dữ liệu cá nhân ra ngoài máy local.
`,
    "utf8",
  );
  console.log(`✓ ${soul}`);
}

if (!fs.existsSync(agents)) {
  fs.writeFileSync(
    agents,
    `# Ohamar Agent

## Kênh chính
- **Zalo Personal** qua plugin zaloclaw (\`channels.zaloclaw\`)
- Control UI / WebChat local (gateway port 18789)

## Ghi nhớ
- Passive collector: lịch sử nhóm lưu JSONL tại \`workspace/zaloclaw/passive/\`
- Dùng tool \`zaloclaw\` cho thao tác Zalo (nhắn tin, nhóm, bạn bè, …)
`,
    "utf8",
  );
  console.log(`✓ ${agents}`);
}

if (!fs.existsSync(tools)) {
  fs.writeFileSync(
    tools,
    `# Tools

- \`zaloclaw\` — 150+ actions Zalo (send, group, friends, poll, recall history, …)
- Browser / exec / files — theo policy OpenClaw sandbox (mặc định main session = full host)
`,
    "utf8",
  );
  console.log(`✓ ${tools}`);
}

// --- install zaloclaw deps + link plugin ---
if (!fs.existsSync(path.join(ZALOCLAW, "package.json"))) {
  console.error(`❌ Missing zaloclaw at ${ZALOCLAW}`);
  process.exit(1);
}

console.log("\n→ npm install (zaloclaw)…");
const zInstall = spawnSync("npm", ["install", "--omit=dev"], {
  cwd: ZALOCLAW,
  stdio: "inherit",
  env: process.env,
});
if (zInstall.status !== 0) {
  console.error("zaloclaw npm install failed");
  process.exit(zInstall.status ?? 1);
}

// Permissions expected by openclaw doctor
try {
  fs.chmodSync(STATE_DIR, 0o700);
  fs.chmodSync(CONFIG_PATH, 0o600);
  fs.chmodSync(ENV_PATH, 0o600);
} catch {
  /* ignore on platforms without chmod semantics */
}

// Session dirs
fs.mkdirSync(path.join(STATE_DIR, "agents", "main", "sessions"), { recursive: true });

console.log("\n→ openclaw plugins install --link vendor/zaloclaw …");
const link = spawnSync(
  process.execPath,
  [OPENCLAW_BIN, "plugins", "install", "--link", ZALOCLAW],
  {
    cwd: ROOT,
    stdio: "inherit",
    env: ohamarEnv(),
  },
);
if (link.status !== 0) {
  console.warn(
    "⚠️  plugins install --link failed. Thử: npm run cli -- plugins install --link ./vendor/zaloclaw",
  );
} else {
  // Patch channel + plugin config now that zaloclaw is registered
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    cfg.channels = cfg.channels || {};
    cfg.channels.zaloclaw = {
      enabled: true,
      dmPolicy: "pairing",
      allowFrom: [],
      groupPolicy: "open",
      groups: {
        "*": { requireMention: true },
      },
      ...(cfg.channels.zaloclaw || {}),
    };
    cfg.plugins = cfg.plugins || {};
    cfg.plugins.entries = cfg.plugins.entries || {};
    cfg.plugins.entries.zaloclaw = {
      enabled: true,
      config: {
        passiveCollector: { enabled: true },
        ...(cfg.plugins.entries.zaloclaw?.config || {}),
      },
      ...(cfg.plugins.entries.zaloclaw || {}),
      enabled: true,
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n", "utf8");
    fs.chmodSync(CONFIG_PATH, 0o600);
    console.log("✓ Enabled channels.zaloclaw + plugins.entries.zaloclaw");
  } catch (e) {
    console.warn("⚠️  Could not patch zaloclaw into config:", e.message);
  }
}

// Best-effort doctor repairs (non-interactive)
console.log("\n→ openclaw doctor --fix --yes …");
spawnSync(process.execPath, [OPENCLAW_BIN, "doctor", "--fix", "--yes"], {
  cwd: ROOT,
  stdio: "inherit",
  env: ohamarEnv(),
});

console.log(`
═══════════════════════════════════════════════════
  🦞 Ohamar setup xong
═══════════════════════════════════════════════════

1. Thêm API key vào:
   ${ENV_PATH}

2. (Tuỳ chọn) đổi model trong:
   ${CONFIG_PATH}
   → agents.defaults.model.primary
     (vd: openai/gpt-4.1, openrouter/..., anthropic/claude-sonnet-4-6)

3. Start gateway:
   npm run start

4. Login Zalo (QR):
   npm run zalo:login

5. Dashboard:
   npm run dashboard

State:     ${STATE_DIR}
Workspace: ${WORKSPACE}
`);
