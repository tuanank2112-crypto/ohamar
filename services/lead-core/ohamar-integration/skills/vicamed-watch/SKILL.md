---
name: vicamed-watch
description: "Theo dõi website Vicamed (home, tin, liên hệ): hash diff, báo khi đổi. Không auto đưa web vào brand-kits. Approver claim = Vicamed."
user-invocable: true
---

# /vicamed-watch

## Yêu cầu

1. Lead Core đang chạy (`npm run lead-core:start`)  
2. `LEAD_CORE_TOKEN` trong env  

## Chạy

```bash
cd ~/ohamar
npm run lead-core:watch
# hoặc
cd services/lead-core && npm run start &  # if needed
node src/watch.mjs --json
```

Sources mặc định:

- https://www.vicamed.vn/
- https://www.vicamed.vn/pages/lien-he
- https://www.vicamed.vn/blogs/news

## Output

- `changed_count == 0` → **không** spam Zalo (NO_REPLY / im)  
- `changed_count > 0` → tóm tắt URL đổi + hash ngắn cho **owner** (boss)  
- **Cấm** copy nội dung web thành `approved_claims` — chỉ báo Vicamed duyệt nếu cần catalog  

## Cron gợi ý (OpenClaw)

```
0 9,17 * * *  Asia/Ho_Chi_Minh
  → run watch; announce only if announce=true
```

Digest Zalo: confirm owner id trước khi hardcode (đề xuất boss Lenq).

## Policy

- Approver brand-kits: **Vicamed**  
- Watch ≠ knowledge auto-ingest  
