# Test full CRM UI — đã sẵn sàng

## Mở

**http://localhost:3080**

## Đăng nhập (seed demo — ổn định)

| | |
|--|--|
| SĐT | `84901000001` *(phone lưu format quốc tế, không có số 0 đầu)* |
| Password | `Demo@1234` |
| Role | admin (seed) |

Sale khác: `84901000002`…`84901000030` / cùng `Demo@1234` · email `nvN.demo@example.com`

## Ohamar Bridge (Phase 1)

| | |
|--|--|
| Bridge panel | http://127.0.0.1:18794/ |
| CRM proxy | `GET /api/v1/ohamar/status` · `GET /api/v1/ohamar/bots` (cần JWT) |
| Dry-run | Mặc định ON — không gửi Zalo thật |

```bash
cd ~/ohamar && npm run bridge   # BRIDGE_DRY_RUN=1
```

## Đã seed

- Org **Vicamed**
- 5 phòng ban, 30 NV
- 120 khách hàng demo
- Marketing templates / blocks / sequences / broadcasts / triggers

## Chưa có (cố ý — hướng B)

- **Nick Zalo CRM** — không QR nick đang dùng Ohamar  
→ Chat/inbox Zalo trong CRM sẽ trống hoặc cần nick test riêng  
→ Auto CSKH Zalo thật = **Ohamar bot**, không phải CRM

## Docker

```bash
cd ~/ohamar/apps/zalocrm
docker.exe compose ps
docker.exe compose logs -f app
# dừng khi xong test:
# docker.exe compose down
```

**Không push GitHub** cho đến khi anh bảo.
