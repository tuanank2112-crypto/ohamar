# 🦞 Ohamar

**Personal AI assistant chạy local** — kết hợp [OpenClaw](https://github.com/openclaw/openclaw) (gateway đa kênh) + [ZaloClaw](https://github.com/monas-team/zaloclaw) (plugin Zalo tài khoản cá nhân).

### UI (hướng B + 2+1)

| Path | Vai trò |
|------|---------|
| `services/ops-console/` | **(1)** Ops API + web map Ohamar (inbox/takeover, chạy được) |
| `apps/crm-ui/` | **(2)** Full frontend ZaloCRM/Monarch — **reference** (AGPL), chưa wire Ohamar |
| Zalo channel | **Chỉ** gateway + zaloclaw — không bật zca-js pool của CRM |

Chi tiết: [`docs/UI-STRATEGY-B.md`](docs/UI-STRATEGY-B.md) · [`apps/crm-ui/OHAMAR.md`](apps/crm-ui/OHAMAR.md)

Ohamar **không fork** toàn bộ OpenClaw (65k+ commits). Thay vào đó:

| Thành phần | Vai trò |
|---|---|
| **openclaw** (npm) | Core: Gateway, agent, tools, Control UI, multi-channel |
| **vendor/zaloclaw** | Channel plugin: Zalo Personal qua `zca-js` (~150 actions) |
| **scripts/** | Wrapper branded, state tách biệt tại `./data` |

State **không** dùng `~/.openclaw` — mọi thứ nằm trong project (`OPENCLAW_STATE_DIR=./data`).

---

## Phân tích 2 repo nguồn

### 1. [openclaw/openclaw](https://github.com/openclaw/openclaw)

- **Là gì:** Personal AI assistant self-hosted (local-first Gateway).
- **Stack:** TypeScript/Node ≥ 22.19, monorepo pnpm khổng lồ.
- **Chức năng chính:**
  - Gateway control plane (port mặc định `18789`)
  - Agent + sessions + skills + sandbox
  - Nhiều channel: WhatsApp, Telegram, Slack, Discord, Signal, Zalo, WebChat, …
  - Plugin system (`openclaw plugins install`)
  - Control UI / dashboard, companion apps (macOS/iOS/Android)
- **Cài nhanh:** `npm i -g openclaw` → `openclaw onboard`

### 2. [monas-team/zaloclaw](https://github.com/monas-team/zaloclaw)

- **Là gì:** **Plugin channel** không chính thức cho OpenClaw → Zalo **tài khoản cá nhân** (không phải OA).
- **Stack:** TypeScript, `zca-js` (reverse-engineered), peer `openclaw >= 2026.5.7`.
- **Chức năng:**
  - QR login session Zalo
  - Inbound/outbound messages, groups, friends, polls, stickers, …
  - ~150 agent tools (`zaloclaw` action)
  - Passive collector JSONL, injection guard, DM/group policy
- **⚠️ ToS:** Không liên kết Zalo/VNG; automation có thể vi phạm ToS / khóa acc — dùng có trách nhiệm.

### Kiến trúc kết hợp (Ohamar)

```
Zalo App ──QR/session──► zaloclaw (plugin)
                              │
                         OpenClaw Gateway  ◄── Control UI / CLI
                              │
                         AI model (API key)
                              │
                         tools / skills / workspace
```

Message flow:

```
Zalo WS → zca-js → zaloclaw monitor
                      ├─ access control / injection guard
                      ├─ passive JSONL log
                      └─ OpenClaw agent → send.ts → Zalo
```

---

## Yêu cầu

- Node.js **≥ 22.19** (khuyến nghị 22 LTS hoặc 24)
- API key model: Anthropic / OpenAI / OpenRouter / xAI / Google / …
- Tài khoản Zalo cá nhân (nếu dùng channel Zalo)

---

## Cài & chạy local

```bash
cd ohamar
npm install          # cài openclaw + deps
npm run setup        # data/, config, link zaloclaw, SOUL.md
```

### 1. API key

Sửa `data/.env`:

```bash
ANTHROPIC_API_KEY=sk-ant-...
# hoặc OPENAI_API_KEY=...
# hoặc OPENROUTER_API_KEY=sk-or-...
```

Đổi model trong `data/openclaw.json` nếu cần:

```json
{
  "agents": {
    "defaults": {
      "model": { "primary": "xai/grok-4.5" },
      "thinkingDefault": "medium"
    }
  }
}
```

### 2. Start gateway

```bash
npm run start
# verbose: npm run start -- --verbose
```

### 3. Login Zalo (QR)

Terminal khác:

```bash
npm run zalo:login
```

Mở Zalo → Trang cá nhân → QR → quét.

### 4. Dashboard / chat

```bash
npm run dashboard
# hoặc mở http://127.0.0.1:18789
```

### 5. Gửi message CLI

```bash
npm run agent -- "Xin chào Ohamar, bạn là ai?"
```

---

## Lệnh thường dùng

| Lệnh | Mô tả |
|------|--------|
| `npm run setup` | Setup lần đầu / re-link plugin |
| `npm run start` | Gateway foreground |
| `npm run stop` | Dừng gateway |
| `npm run status` | Trạng thái |
| `npm run dashboard` | Mở Control UI |
| `npm run zalo:login` | QR login Zalo |
| `npm run doctor` | Chẩn đoán |
| `npm run cli -- <args>` | Passthrough openclaw (vd: `plugins list`) |

Hoặc: `node bin/ohamar.mjs help`

---

## Cấu hình quan trọng

File: `data/openclaw.json`

```json
{
  "channels": {
    "zaloclaw": {
      "dmPolicy": "pairing",
      "allowFrom": [],
      "groupPolicy": "open",
      "groups": {
        "*": { "requireMention": true }
      }
    }
  },
  "plugins": {
    "entries": {
      "zaloclaw": {
        "enabled": true,
        "config": {
          "passiveCollector": { "enabled": true }
        }
      }
    }
  }
}
```

- **dmPolicy:** `pairing` (an toàn) | `allowlist` | `open` | `disabled`
- Approve pairing: `npm run cli -- pairing approve zaloclaw <code>`
- Passive logs: `workspace/zaloclaw/passive/{groupId}.jsonl`

---

## Cấu trúc project

```
ohamar/
├── bin/ohamar.mjs          # CLI entry
├── scripts/                # setup, start, zalo-login, …
├── vendor/zaloclaw/        # plugin nguồn (git clone)
├── data/                   # OPENCLAW_STATE_DIR (gitignored)
│   ├── openclaw.json
│   ├── .env
│   └── credentials/
├── workspace/              # agent workspace
│   ├── SOUL.md
│   ├── AGENTS.md
│   └── skills/
├── package.json
└── README.md
```

---

## Model (mặc định)

Cả **Gia Huy (main)** và **Minh Phát (worker)**:

- Primary: `xai/grok-4.5` · thinking **medium**
- Thinking / chuyên sâu (khi cần): `/model NineSonnet` → `nineflare/pro/claude-sonnet-4-6-high-thinking`
- Chi tiết: `workspace/ROUTING.md` · `workspace-worker/ROUTING.md`

## Hai instance (bắt buộc tường minh)

| | Main · Gia Huy | Worker · Minh Phát |
|--|----------------|--------------------|
| Env | `OHAMAR_INSTANCE=main` | `OHAMAR_INSTANCE=worker` |
| State | `data/` | `data-worker/` |
| Port | 18789 | 18790 |
| Start | `npm run start` | `npm run start:worker` |

Scripts npm **luôn set** `OHAMAR_INSTANCE` — không còn phụ thuộc unset = main.

## Ops (lock · health · backup · alert)

```bash
npm run health              # main: instance / account / port / credentials
npm run health:worker

npm run cleanup:legacy      # archive leftover worker files under data/
npm run backup              # tar.gz data/ + data-worker/ → backups/

# Watchdog (process down / unhealthy → alerts.jsonl + optional cmd)
npm run watchdog            # foreground
# .env: OHAMAR_ALERT_CMD='…'  OHAMAR_ALERT_TO=<zaloUserId>
```

- **Process lock:** không chạy 2 gateway cùng instance (pid + lock file).
- **Graceful stop:** SIGTERM → chờ 15s → SIGKILL; `npm run stop`.
- **Credential fail-closed:** không fallback `~/.openclaw` / sibling instance.
- **FS:** `tools.fs.workspaceOnly: true` (không đọc/ghi ngoài workspace).
- **Send dedup:** zaloclaw chặn gửi trùng trong ~90s (reconnect storm).

## Mất session Zalo → QR login lại

Khi bot không nhận/gửi tin, hoặc log báo session/auth invalid:

```bash
# Gia Huy (main)
npm run stop
npm run zalo:login          # quét QR acc Gia Huy Vicamed
npm run start

# Minh Phát (worker)
npm run stop:worker
npm run zalo:login:worker   # quét QR acc Minh Phát Vicamed
npm run start:worker
```

Script tự backup credentials cũ rồi force QR mới. Session ghi vào:

- Main: `data/credentials/zaloclaw-credentials.json`
- Worker: `data-worker/credentials/zaloclaw-credentials.json`

## Bảo mật

1. **DM pairing mặc định** — unknown sender phải approve code.
2. State/credentials trong `./data` (và `data-worker/`) — **đừng commit** (đã `.gitignore`).
3. Sandbox: xem docs OpenClaw (`agents.defaults.sandbox`) nếu expose group chat.
4. Session Zalo hết hạn → mục **Mất session Zalo** ở trên.

---

## Nâng cấp

```bash
# Core
npm update openclaw

# Plugin Zalo
cd vendor/zaloclaw && git pull && npm install --omit=dev
cd ../.. && npm run setup
```

---

## License & attribution

- Ohamar wrapper: MIT (product scaffold của bạn)
- OpenClaw: MIT — [openclaw/openclaw](https://github.com/openclaw/openclaw)
- ZaloClaw: MIT — [monas-team/zaloclaw](https://github.com/monas-team/zaloclaw)

Zalo là thương hiệu của VNG. Plugin không có liên kết chính thức.

---

## Tài liệu ngoài

- OpenClaw docs: https://docs.openclaw.ai  
- Getting started: https://docs.openclaw.ai/start/getting-started  
- ZaloClaw actions: `vendor/zaloclaw/docs/actions.md`
