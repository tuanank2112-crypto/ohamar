# Ohamar Ops Console (demo)

**AI-first + sale takeover** — UI sales theo dõi, chat bằng nick bot, pause AI, auto-resume.

## Chạy demo (máy dev)

### 1) Backend API

```bash
cd ~/ohamar
npm run ops-console
# → http://127.0.0.1:18793  (API + prototype HTML cũ)
```

### 2) Frontend Vue (Monarch-style — dùng cái này)

```bash
cd ~/ohamar/services/ops-console/web
npm install   # lần đầu
npm run dev
# → http://127.0.0.1:5174
```

Hoặc: `npm run ops-console:web` từ root.

Vite proxy `/v1` → API `:18793`.

**Mở: http://127.0.0.1:5174/**

UI: token Monarch (`monarch.css` từ source CRM) + shell inbox 3 cột.  
Backend: ops-console (chưa full ZaloCRM API). Thiếu feature CRM → bổ sung sau.

`web/NOTICE` — ghi nhận nguồn design Monarch / AGPL.

## Luồng thử trên UI

1. Chọn thread (Gia Huy / Minh Phát demo).
2. **Giả lập khách** → AI demo trả lời (`ai_active`).
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

## Chưa có (bổ sung sau)

- Gửi Zalo thật qua zaloclaw
- Gateway skip AI khi `ai-allowed=false`
- Full views CRM (contacts, analytics, RBAC…)
- Auth sale / multi-user
- Socket realtime như ZaloCRM

Data: `services/ops-console/data/ops-store.json` (gitignore).
