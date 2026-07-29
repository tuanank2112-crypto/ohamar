# apps/zalocrm — full ZaloCRM stack (UI đầy đủ)

Mục tiêu: **hiển thị toàn bộ frontend CRM** (Dashboard, Chat, Contacts, Reports, RBAC…).

## Hướng B (Ohamar)

| | |
|--|--|
| Zalo nick (Gia Huy / Minh Phát) | **Chỉ Ohamar** gateway |
| CRM zca-js / QR login cùng nick | **Không** |
| `AUTOMATION_STUB_MODE=true` | Mặc định trong `.env` — CRM không bắn Zalo SDK thật |

## Yêu cầu

- **Docker Desktop** đang chạy (Windows + WSL integration)
- ~4–8 GB RAM free lần build đầu

## Chạy (full UI một cổng)

```bash
# 1) Bật Docker Desktop trên Windows, đợi engine Ready

# 2) Build + up
cd ~/ohamar/apps/zalocrm
docker.exe compose up -d --build

# 3) Migrate DB (lần đầu)
docker.exe compose exec app npx prisma migrate deploy
# nếu seed có:
# docker.exe compose exec app npx tsx scripts/seed.ts   # xem scripts trong container

# 4) Mở
# http://localhost:3080
```

Hoặc script:

```bash
cd ~/ohamar
./apps/zalocrm/start-full-ui.sh
```

## FE dev tách (optional)

```bash
# stack API qua docker chỉ db+redis+app, hoặc
cd ~/ohamar/apps/crm-ui && npm run dev   # proxy :3080
```

## So với ops-console

| | zalocrm :3080 | ops-console :5174 |
|--|---------------|-------------------|
| Full màn CRM | **Có** | Không |
| Takeover AI Ohamar | Chưa map | Demo |
| Zalo owner | Không (stub) | Ohamar sau |

## License

Upstream AGPL — `NOTICE.upstream`. Dùng nội bộ / tuân AGPL nếu public.
