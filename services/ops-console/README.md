# Ohamar Ops Console (demo)

**AI-first + sale takeover** — UI sales theo dõi, chat bằng nick bot, pause AI, auto-resume.

## Chạy demo (máy dev)

```bash
cd ~/ohamar/services/ops-console
# idle 60s cho demo nhanh (prod: 300–600)
OPS_IDLE_SEC=60 node src/server.mjs
```

Mở: **http://127.0.0.1:18793**

Hoặc từ root:

```bash
npm run ops-console
```

## Luồng thử trên UI

1. Chọn thread (Gia Huy / Minh Phát demo).
2. **Giả lập khách nhắn** → AI demo trả lời (`ai_active`).
3. **Tiếp quản** → AI pause; countdown auto-resume.
4. Gõ tin sale **Gửi** → tin `sale` (nick bot, demo local).
5. Đợi ~60s không nhắn → **AI active** lại (event `auto_resume`).
6. Hoặc **Pin human** → không auto; chỉ **Trả lại AI** mới bật.
7. Gửi tin khi đang AI → **tự pause** (`auto_pause_on_send`).

## API (tóm tắt)

| Method | Path | Ý |
|--------|------|---|
| GET | `/v1/health` | Health + idle config |
| GET | `/v1/threads` | List + mode |
| GET | `/v1/threads/:id` | Messages |
| POST | `/v1/threads/:id/takeover` | `human_paused` |
| POST | `/v1/threads/:id/pin` | `human_pinned` |
| POST | `/v1/threads/:id/resume` | `ai_active` |
| POST | `/v1/threads/:id/send` | Sale send (demo) |
| POST | `/v1/threads/:id/sim-customer` | Fake inbound |
| GET | `/v1/ai-allowed?thread_id=&bot=` | Hook cho gateway |
| POST | `/v1/demo/reset` | Seed lại |

## State machine

```text
ai_active ──takeover/send──► human_paused ──idle/resume──► ai_active
                │                    │
                └──pin──► human_pinned ──resume only──► ai_active
```

## Chưa có (phase sau)

- Gửi Zalo thật qua zaloclaw
- Gateway skip AI khi `ai-allowed=false`
- Auth sale / multi-user
- Lead-core sync

Data file: `services/ops-console/data/ops-store.json` (gitignore local).
