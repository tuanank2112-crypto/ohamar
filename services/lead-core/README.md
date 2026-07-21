# Lead Core (feature branch)

**Branch:** `feature/lead-core-vicamed-watch`  
**Scope:** Phase 0–1 only — **no Facebook API** on this branch.

Shared Lead/Conversation Core for Gia Huy / Minh Phát / (later) FB Page:

- SQLite WAL
- Ownership + optimistic `version`
- Inbound dedup `(channel, source_message_id)`
- Find-or-create `(channel, source_user_id, thread_id)`
- Outbound authorization (caller must be owner)
- Consent append-only (`grant` / `withdraw` + `purpose`)
- Audit log + watch snapshots

## Quick start

```bash
cd services/lead-core
cp .env.example .env
# set LEAD_CORE_TOKEN to a long random string

npm run migrate
npm start
# → http://127.0.0.1:18792
```

From ohamar root (scripts on feature branch):

```bash
npm run lead-core:start
npm run lead-core:watch   # after core is up
npm run lead-core:backup
```

## Auth

All routes except `GET /v1/health` require:

```http
Authorization: Bearer <LEAD_CORE_TOKEN>
```

## Endpoints

| Method | Path | Notes |
|--------|------|--------|
| GET | `/v1/health` | Liveness |
| GET | `/v1/metrics` | Counts |
| POST | `/v1/events` | Inbound find-or-create + dedup + reopen |
| POST | `/v1/conversations/:id/claim` | Claim ownership |
| POST | `/v1/conversations/:id/outbound` | **Must succeed before channel send** |
| POST | `/v1/conversations/:id/close` | Close + close_reason |
| POST | `/v1/handoffs` | Transfer owner (zalo consent for minh_phat) |
| POST | `/v1/consents` | Append grant/withdraw |
| GET/POST | `/v1/watch/snapshots` | Vicamed web watch hashes |

## Enforce rules (v2)

1. Outbound only if `caller == owner` and version/lease OK → else **409**
2. Events deduped by message id
3. CLOSED + new inbound → reopen same conversation id
4. Backup: `npm run backup` → `backups/lead-core/<stamp>/`
5. Retention default **365 days** (ops; see meta table)

## Install skills into Ohamar workspaces

```bash
node services/lead-core/install-skills.mjs
```

Copies skills into `workspace/skills/` and `workspace-worker/skills/` (gitignored local state).

## Brand-kits

Approver: **Vicamed**. Watch never auto-promotes web content into claims.

## Outbound gate (hard)

```bash
npm run lead-core:gate -- \
  --caller minh_phat \
  --channel zalo_worker \
  --user-id UID --thread-id TID --message-id MID \
  --text "..." --claim --json
# exit 0 ALLOWED · exit 2 DENIED
```

## Wire into Zalo gateways (hard enforce)

```bash
# 1) Lead Core up
npm run lead-core:start

# 2) Patch zaloclaw + rebuild dist (idempotent)
npm run lead-core:apply-bridge

# 3) Restart both bots (env injects LEAD_CORE_* via scripts/env.mjs)
npm run stop && npm run start
npm run stop:worker && npm run start:worker
# or: npm run stack:start
```

When `LEAD_CORE_TOKEN` is set, `ohamarEnv` sets **`LEAD_CORE_ENFORCE=1`** by default:

- **Inbound** → auto `POST /v1/events`
- **Outbound** → must pass Core or send returns `Lead Core blocked send: …`

## Cron (Vicamed watch)

Gateway **main** must be running:

```bash
npm run lead-core:register-cron
# optional: --to <zaloOwnerId>   default 5139686145106992704
npm run cli -- cron list
```

Schedule: `0 9,17 * * *` `Asia/Ho_Chi_Minh`.  
Unchanged → stdout `NO_REPLY` (no spam). Changed → digest announce.

## Export / merge

This work lives on **`feature/lead-core-vicamed-watch`**.  
Do **not** merge to personal `main` plans until reviewed. FB adapter will stay on this (or a child) branch.
