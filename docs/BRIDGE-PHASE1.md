# Bridge Phase 1 — CRM ↔ Ohamar

## Mục tiêu

- **Giữ full UI CRM** (`:3080`)
- **Zalo + AI** vẫn do **Ohamar** (zaloclaw, 2 bot)
- CRM **không** mở zca-js cùng nick Ohamar

## Thành phần

| Service | Port | Vai trò |
|---------|------|---------|
| Ohamar main / worker | 18789 / 18790 | Gateway + zaloclaw (VPS hoặc local) |
| **ohamar-bridge** | **18794** | API: bots health, send, ai-mode |
| ZaloCRM app | 3080 | UI + proxy `/api/v1/ohamar/*` → bridge |

## API bridge

| Method | Path | Mô tả |
|--------|------|--------|
| GET | `/v1/health` | Bridge sống |
| GET | `/v1/bots` | 2 bot listening + credentials |
| POST | `/v1/send` | `{ bot, target, text, dry_run? }` |
| GET/POST | `/v1/ai-mode` | pause/pin/active theo thread |
| GET | `/v1/events` | audit bridge |

CRM (JWT):

- `GET /api/v1/ohamar/status` (public-ish)
- `GET /api/v1/ohamar/bots`
- `POST /api/v1/ohamar/send`
- `GET|POST /api/v1/ohamar/ai-mode`

## Chạy local

```bash
# 1) Bridge (mặc định DRY-RUN — không gửi Zalo)
cd ~/ohamar
npm run bridge
# http://127.0.0.1:18794/

# 2) CRM Docker (đã có)
cd ~/ohamar/apps/zalocrm
# .env: OHAMAR_BRIDGE_URL=http://host.docker.internal:18794
docker.exe compose up -d --build   # rebuild app sau khi patch backend

# 3) Bot Ohamar — trên VPS (live send)
#    local: npm run start / start:worker nếu có credentials
```

Test dry-run:

```bash
curl -s http://127.0.0.1:18794/v1/bots | head
curl -s -X POST http://127.0.0.1:18794/v1/send \
  -H 'Content-Type: application/json' \
  -d '{"bot":"main","target":"test","text":"hi","dry_run":true}'
```

Live send (bot listening + session OK):

```bash
BRIDGE_DRY_RUN=0 npm run bridge:live
# POST /v1/send without dry_run
```

## Đã bổ sung

- UI CRM: menu **Hệ thống → Ohamar Bots** (`/ohamar-bots`)
- zaloclaw: skip AI khi bridge `ai_mode` ≠ `ai_active`
- zaloclaw: notify inbound → bridge `/v1/events/inbound`
- CRM: `GET /api/v1/ohamar/events`

## Phase 2 (sau / chưa)

- Inbound full sync vào bảng conversation CRM (hiện chỉ audit events)
- Live send khi bot VPS listening + `BRIDGE_DRY_RUN=0`
- Map nick CRM account id ↔ main/worker

## Backup

Trước bridge: `~/backups/ohamar-pre-bridge/20260724_174536/`
