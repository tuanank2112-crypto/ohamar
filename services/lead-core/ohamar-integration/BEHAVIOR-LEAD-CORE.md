# Lead Core — rules (include / link from BEHAVIOR.md on feature branch)

## Enforce (không chỉ “nên”)

1. **Mọi tin ra** (khi Lead Core đang chạy): bắt buộc  
   `npm run lead-core:gate -- --caller <gia_huy|minh_phat> --channel ... --user-id ... --thread-id ... --message-id ... --text "..." --claim`  
   → exit 0 mới `zaloclaw` send. Exit 2 = **CẤM gửi**.
2. Tương đương API: `POST /v1/conversations/{id}/outbound` → `allowed`.
3. Handoff sang Minh Phát chủ động Zalo: consent `type=zalo` **grant** còn hiệu lực.
4. Không bịa lead; không gửi khi Core 409/down (escalate human).
5. Vicamed duyệt brand-kits — web watch chỉ báo diff, không auto claim.

## Caller / channel

| Bot | caller | channel |
|-----|--------|---------|
| Gia Huy | `gia_huy` | `zalo_main` |
| Minh Phát | `minh_phat` | `zalo_worker` |

## Watch cron

`npm run lead-core:register-cron` (gateway main phải up) → 09:00 & 17:00 ICT, announce owner khi có diff.
