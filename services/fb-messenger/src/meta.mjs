import crypto from "node:crypto";
import { APP_SECRET, PAGE_TOKEN } from "./config.mjs";

const GRAPH = "https://graph.facebook.com/v21.0";

export function verifySignature(rawBody, signatureHeader) {
  if (!APP_SECRET) return true; // dev mode without secret
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const expected = crypto
    .createHmac("sha256", APP_SECRET)
    .update(rawBody)
    .digest("hex");
  const got = signatureHeader.slice("sha256=".length);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(got));
  } catch {
    return false;
  }
}

export async function sendText(psid, text) {
  if (!PAGE_TOKEN) {
    console.warn("[fb] no PAGE_ACCESS_TOKEN — dry-run send:", text.slice(0, 80));
    return { dry_run: true };
  }
  const url = `${GRAPH}/me/messages?access_token=${encodeURIComponent(PAGE_TOKEN)}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: psid },
      messaging_type: "RESPONSE",
      message: { text: text.slice(0, 2000) },
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(j.error?.message || `Graph send HTTP ${r.status}`);
  }
  return j;
}

/**
 * Note: Messenger 24h policy — RESPONSE only valid within 24h of user message.
 * Outside window need message tags (not implemented in scaffold).
 */
