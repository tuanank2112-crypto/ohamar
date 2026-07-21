#!/usr/bin/env node
/**
 * Facebook Messenger webhook server → Lead Core.
 * Meta: Page subscriptions + callback URL https://.../webhook
 */
import http from "node:http";
import {
  HOST,
  LEAD_TOKEN,
  PAGE_TOKEN,
  PORT,
  VERIFY_TOKEN,
} from "./config.mjs";
import { handleMessagingEvent } from "./handler.mjs";
import { verifySignature } from "./meta.mjs";

if (!VERIFY_TOKEN) {
  console.warn("⚠️  FB_VERIFY_TOKEN empty — set before Meta webhook verification");
}
if (!LEAD_TOKEN) {
  console.warn("⚠️  LEAD_CORE_TOKEN missing — start Lead Core + copy token");
}
if (!PAGE_TOKEN) {
  console.warn("⚠️  FB_PAGE_ACCESS_TOKEN empty — outbound is dry-run only");
}

function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);

  // Health
  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        service: "fb-messenger",
        lead_token: Boolean(LEAD_TOKEN),
        page_token: Boolean(PAGE_TOKEN),
      }),
    );
    return;
  }

  // Meta webhook verification
  if (req.method === "GET" && url.pathname === "/webhook") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === VERIFY_TOKEN && challenge) {
      console.log("[fb] webhook verified");
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(challenge);
      return;
    }
    res.writeHead(403).end("forbidden");
    return;
  }

  // Inbound events
  if (req.method === "POST" && url.pathname === "/webhook") {
    const raw = await readRaw(req);
    const sig = req.headers["x-hub-signature-256"];
    if (!verifySignature(raw, sig)) {
      console.warn("[fb] bad signature");
      res.writeHead(401).end("bad signature");
      return;
    }

    let body;
    try {
      body = JSON.parse(raw.toString("utf8"));
    } catch {
      res.writeHead(400).end("bad json");
      return;
    }

    // Always 200 quickly for Meta
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));

    if (body.object !== "page") return;

    for (const entry of body.entry || []) {
      const pageId = entry.id;
      for (const event of entry.messaging || []) {
        try {
          const r = await handleMessagingEvent(event, pageId);
          if (r && !r.skipped && !r.duplicate) {
            console.log("[fb] handled", r);
          }
        } catch (e) {
          console.error("[fb] handler error", e.message);
        }
      }
    }
    return;
  }

  res.writeHead(404).end("not found");
});

server.listen(PORT, HOST, () => {
  console.log(`📘 FB Messenger adapter http://${HOST}:${PORT}`);
  console.log(`   webhook: http://${HOST}:${PORT}/webhook`);
  console.log(`   (public HTTPS tunnel required for Meta)`);
});
