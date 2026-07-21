# Multi-channel Vicamed (feature branch)

**Git branch:** `feature/lead-core-vicamed-watch`  
**Do not merge to personal main until reviewed.**

## Components

| Component | Path | Port |
|-----------|------|------|
| Lead Core | `services/lead-core` | 18792 |
| FB Messenger | `services/fb-messenger` | 18793 |
| Zalo main (Gia Huy) | ohamar | 18789 |
| Zalo worker (Minh Phát) | ohamar | 18790 |

## Quick start (full local)

```bash
git checkout feature/lead-core-vicamed-watch

# 1) Lead Core
cd services/lead-core && cp -n .env.example .env   # set TOKEN
cd ../..
npm run lead-core:migrate
npm run lead-core:start &

# 2) Wire Zalo enforce
npm run lead-core:apply-bridge
npm run stop; npm run start &
npm run stop:worker; npm run start:worker &

# 3) Watch cron (main gateway up)
npm run lead-core:register-cron

# 4) FB (optional — needs Meta tokens + public HTTPS)
cd services/fb-messenger && cp -n .env.example .env
# fill FB_* + same LEAD_CORE_TOKEN
npm run fb:start &

# Doctor
npm run lead-core:doctor
```

Or: `npm run stack:start` (Core + 2 Zalo; FB separate).

## Data flow

```
Zalo/FB inbound → Lead Core /v1/events (dedup, identity)
Bot reply       → Lead Core /v1/outbound (owner enforce) → channel send
Watch web       → snapshots + cron announce owner
FB FAQ          → safe brand-kits only; Vicamed approves claims
```

## Approver

**Vicamed** for all brand-kits claims/prices/media.

## Facebook

See `services/fb-messenger/README.md`. Requires Messenger Platform (not WhatsApp Cloud API naming). Respect 24h messaging window.
