# UI strategy — hướng B + (2+1)

## Kênh Zalo (B)

- **Owner:** Ohamar gateway + zaloclaw only.
- **CRM zca-js:** tắt / không deploy cùng nick.

## Frontend (2 + 1)

```text
ohamar/
  apps/crm-ui/                 # (2) full FE ZaloCRM — reference, AGPL
  services/ops-console/        # (1) ops API + Vue web map Ohamar (chạy được)
  services/ops-console/web/    # inbox 1-1 + nhóm + takeover (demo → map)
```

| | crm-ui (2) | ops-console web (1) |
|--|------------|---------------------|
| Giữ trọn màn CRM | Có | Không |
| Chạy với Ohamar B | Chưa (cần port API) | Có (demo/API ops) |
| Zalo socket | Không bật | Không — qua Ohamar sau |

## Lệnh

```bash
# (1) Ops + Ohamar-oriented UI
npm run ops-console          # API :18793
npm run ops-console:web      # UI  :5174

# (2) Full CRM FE reference
cd apps/crm-ui && npm install && npm run dev
# cần backend ZaloCRM nếu muốn màn “sống”
```
