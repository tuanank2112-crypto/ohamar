---
name: lead-handoff
description: "Lead Core — ghi event, claim owner, xin phép outbound, handoff, consent. Dùng khi bán/chuyển khách/đa kênh. HTTP 127.0.0.1:18792."
user-invocable: true
---

# /lead-handoff

Gọi **Lead Core** (localhost). Token: env `LEAD_CORE_TOKEN` (cùng `services/lead-core/.env`).

Base: `http://127.0.0.1:18792`

Header mọi request (trừ health):

```
Authorization: Bearer <LEAD_CORE_TOKEN>
Content-Type: application/json
```

## Caller id

| Bot | `caller` / owner |
|-----|------------------|
| Gia Huy | `gia_huy` |
| Minh Phát | `minh_phat` |
| Human | `human` |

## 1. Tin vào (sau khi nhận Zalo)

```bash
curl -s -X POST http://127.0.0.1:18792/v1/events \
  -H "Authorization: Bearer $LEAD_CORE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "zalo_worker",
    "source_user_id": "<zalo_uid>",
    "thread_id": "<dm_or_group_id>",
    "source_message_id": "<unique_msg_id>",
    "text": "...",
    "actor": "minh_phat"
  }'
```

- Trùng `source_message_id` → `duplicate: true` (bỏ qua xử lý lại).
- Conversation `CLOSED` + tin mới → **reopen** cùng id.

## 2. Claim ownership

```json
POST /v1/conversations/{id}/claim
{ "caller": "minh_phat", "version": 1 }
```

## 3. TRƯỚC KHI GỬI TIN ZALO (bắt buộc)

```json
POST /v1/conversations/{id}/outbound
{
  "caller": "minh_phat",
  "version": 2,
  "idempotency_key": "zalo:<thread>:<cliMsgId>",
  "text": "..."
}
```

- `allowed: true` → mới được `zaloclaw` send  
- `409` → **không gửi** (sai owner / version)  
- Trùng idempotency → không gửi lần 2  

## 4. Consent (append-only)

```json
POST /v1/consents
{
  "conversation_id": "...",
  "type": "zalo",
  "purpose": "tu van san pham Vicamed qua Zalo",
  "action": "grant",
  "source_message_id": "..."
}
```

`action`: `grant` | `withdraw`. Handoff sang `minh_phat` cần grant `zalo` còn hiệu lực.

## 5. Handoff

```json
POST /v1/handoffs
{
  "conversation_id": "...",
  "from_owner": "fb_page",
  "to_owner": "minh_phat",
  "idempotency_key": "ho:...",
  "reason": "khach muon Zalo",
  "summary": "..."
}
```

## Gate CLI (cứng — ưu tiên hơn curl tay)

```bash
# Trước MỌI tin Zalo ra (khi đã bật Lead Core):
npm run lead-core:gate -- \
  --caller minh_phat \
  --channel zalo_worker \
  --user-id <uid> \
  --thread-id <thread> \
  --message-id <unique> \
  --text "..." \
  --claim --json

# exit 0 = ALLOWED → mới zaloclaw send
# exit 2 = DENIED → KHÔNG gửi
```

## Anti-patterns

- Gửi Zalo khi gate exit 2 / outbound 409  
- Bịa lead / bỏ Core  
- Update đè consent (phải withdraw + grant mới)  
