import { AUTO_REPLY } from "./config.mjs";
import { buildSafeReply } from "./faq.mjs";
import {
  appendConsent,
  authorizeOutbound,
  claimFb,
  handoffToSale,
  ingestFacebookMessage,
} from "./lead.mjs";
import { sendText } from "./meta.mjs";

/**
 * Process one Messenger messaging event
 */
export async function handleMessagingEvent(event, pageId) {
  const sender = event.sender?.id;
  const message = event.message;
  if (!sender || !message || message.is_echo) return { skipped: true };

  const text = message.text || "";
  const mid = message.mid || `fb-${Date.now()}`;

  // 1) Ingest → Lead Core
  let conv;
  try {
    const ev = await ingestFacebookMessage({
      psid: sender,
      messageId: mid,
      text,
      pageId,
    });
    if (ev.duplicate) {
      return { duplicate: true };
    }
    conv = ev.conversation;
  } catch (e) {
    console.error("[fb] lead ingest failed", e.message);
    // still try dry reply without core if down
    if (AUTO_REPLY === "safe_faq" && text) {
      await sendText(sender, buildSafeReply(text));
    }
    return { error: e.message };
  }

  // 2) Claim as fb_page
  try {
    const c = await claimFb(conv.id, conv.version);
    conv = c.conversation || conv;
  } catch (e) {
    console.warn("[fb] claim", e.message);
  }

  // 3) Consent phrases
  const lower = text.toLowerCase();
  if (/đồng ý zalo|dong y zalo|consent zalo/.test(lower)) {
    try {
      await appendConsent(
        conv.id,
        "zalo",
        "lien he tu van san pham Vicamed qua Zalo",
        "grant",
        mid,
      );
    } catch (e) {
      console.warn("[fb] consent", e.message);
    }
    try {
      await handoffToSale(
        conv.id,
        `FB lead ${sender}: ${text.slice(0, 200)}`,
        `ho:fb:${mid}`,
      );
    } catch (e) {
      // may fail without phone — still ok
      console.warn("[fb] handoff", e.message);
    }
  }

  // 4) Auto-reply safe FAQ
  if (AUTO_REPLY === "off" || !text.trim()) {
    return { conversation_id: conv.id, replied: false };
  }

  const reply = buildSafeReply(text);
  try {
    // re-fetch version after claim
    const ver = conv.version;
    const out = await authorizeOutbound(
      conv.id,
      ver,
      reply,
      `fb-out:${mid}`,
      sender,
    );
    if (!out.allowed && !out.duplicate) {
      console.warn("[fb] outbound not allowed", out);
      return { conversation_id: conv.id, replied: false, blocked: true };
    }
  } catch (e) {
    // If human took ownership, do not reply
    if (e.status === 409) {
      console.log("[fb] skip reply — ownership conflict (likely human/other)");
      return { conversation_id: conv.id, replied: false, blocked: true };
    }
    console.warn("[fb] outbound auth", e.message);
  }

  await sendText(sender, reply);
  return { conversation_id: conv.id, replied: true };
}
