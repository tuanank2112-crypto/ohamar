import { LEAD_TOKEN, LEAD_URL } from "./config.mjs";

async function api(method, p, body) {
  const r = await fetch(`${LEAD_URL}${p}`, {
    method,
    headers: {
      Authorization: `Bearer ${LEAD_TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(json.error || `Lead Core HTTP ${r.status}`);
    e.status = r.status;
    e.body = json;
    throw e;
  }
  return json;
}

export async function ingestFacebookMessage({
  psid,
  messageId,
  text,
  pageId,
}) {
  return api("POST", "/v1/events", {
    channel: "facebook",
    source_user_id: psid,
    thread_id: psid,
    source_message_id: messageId,
    text: text || null,
    actor: "fb_page",
    meta: { page_id: pageId },
  });
}

export async function claimFb(conversationId, version) {
  return api("POST", `/v1/conversations/${conversationId}/claim`, {
    caller: "fb_page",
    version,
  });
}

export async function authorizeOutbound(
  conversationId,
  version,
  text,
  idem,
  threadId,
) {
  return api("POST", `/v1/conversations/${conversationId}/outbound`, {
    caller: "fb_page",
    version,
    idempotency_key: idem,
    text,
    channel: "facebook",
    thread_id: threadId || conversationId,
  });
}

export async function appendConsent(conversationId, type, purpose, action, sourceMessageId) {
  return api("POST", "/v1/consents", {
    conversation_id: conversationId,
    type,
    purpose,
    action: action || "grant",
    source_message_id: sourceMessageId,
    actor: "fb_page",
  });
}

export async function handoffToSale(conversationId, summary, idem) {
  return api("POST", "/v1/handoffs", {
    conversation_id: conversationId,
    from_owner: "fb_page",
    to_owner: "minh_phat",
    idempotency_key: idem,
    reason: "customer_wants_zalo_or_sale",
    summary,
    require_zalo_consent: true,
  });
}
