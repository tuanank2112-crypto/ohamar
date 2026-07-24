# apps/crm-ui — full ZaloCRM frontend (reference)

## Vai trò trong monorepo (hướng **2 + 1**)

| Path | Vai trò |
|------|---------|
| **`apps/crm-ui`** | **(2)** Copy **trọn** frontend source CRM — kho UI/Monarch/views |
| **`services/ops-console`** | **(1)** UI + API **chạy với Ohamar** (inbox, takeover demo → map sau) |
| **`vendor/zaloclaw` + gateway** | **Duy nhất** owner Zalo (không bật zca-js CRM) |

## Chạy reference UI (cần backend CRM gốc — không phải Ohamar)

```bash
cd apps/crm-ui
npm install
# Cần ZaloCRM API (Postgres stack) — xem upstream docker-compose
# VITE_* / proxy trong vite.config.ts trỏ backend CRM
npm run dev
```

**Không** dùng app này để login Zalo nếu Ohamar đang cầm cùng nick.

## Port sang Ohamar (dần)

1. Lấy component/layout từ `src/layouts`, `src/assets/monarch.css`, `src/views/ChatView.vue`…
2. Gắn API Ohamar / `services/ops-console` / lead-core.
3. Màn không cần Zalo (settings shell, một số report) port trước.
4. Chat send/receive → **chỉ** qua gateway Ohamar.

## License

AGPL-3.0 — xem `NOTICE`.
