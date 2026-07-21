# Facebook Messenger adapter (Phase 2 scaffold)

**Branch:** `feature/lead-core-vicamed-watch`  
Connects **Facebook Page** (Messenger Platform) → **Lead Core** → optional handoff to Minh Phát.

## What it does

| Feature | Status |
|---------|--------|
| Webhook verify (`hub.challenge`) | ✅ |
| Ingest messages → Lead Core `channel=facebook` | ✅ |
| Owner `fb_page` + outbound authorize | ✅ |
| Safe FAQ (hotline/address/product list from brand-kits) | ✅ |
| Consent phrase “ĐỒNG Ý ZALO” → grant + handoff attempt | ✅ |
| Graph send (needs `FB_PAGE_ACCESS_TOKEN`) | ✅ |
| Message tags / outside 24h | ❌ later |
| Full LLM catalog pitch | ❌ use Zalo bots / human |

## Setup Meta

1. [developers.facebook.com](https://developers.facebook.com) → App → Messenger  
2. Add Page → generate **Page access token**  
3. Webhooks → Callback URL: `https://<public-host>/webhook`  
4. Verify token = `FB_VERIFY_TOKEN`  
5. Subscribe: `messages`, `messaging_postbacks`  
6. App Review for production `pages_messaging`

Local dev: `cloudflared tunnel` or `ngrok http 18793` → use public HTTPS.

## Run

```bash
# Lead Core must be up
npm run lead-core:start

cd services/fb-messenger
cp .env.example .env
# fill FB_* + LEAD_CORE_TOKEN (same as lead-core/.env)

npm start
# → http://127.0.0.1:18793/webhook
```

From ohamar root:

```bash
npm run fb:start
```

## Env

See `.env.example`. Critical:

- `FB_VERIFY_TOKEN`
- `FB_PAGE_ACCESS_TOKEN`
- `FB_APP_SECRET` (signature check)
- `LEAD_CORE_TOKEN`

## 24h policy

Meta only allows free-form `RESPONSE` within **24 hours** of user message.  
This scaffold uses `messaging_type: RESPONSE` only — no proactive spam outside the window.

## Security

- Bind localhost by default; put reverse proxy + TLS in front for public webhook.
- Never commit `.env`.
- Approver for claims: **Vicamed** (safe FAQ does not invent clinical claims).
