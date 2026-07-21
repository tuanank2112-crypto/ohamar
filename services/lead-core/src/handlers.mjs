import { getDb, nowIso, uuid } from "./db.mjs";
import { audit } from "./audit.mjs";
import { LEASE_TTL_SEC, OWNERS, STATUSES } from "./config.mjs";

function bad(msg, code = 400) {
  const e = new Error(msg);
  e.status = code;
  return e;
}

export function getConversation(id) {
  return getDb().prepare(`SELECT * FROM conversations WHERE id = ?`).get(id);
}

export function metrics() {
  const d = getDb();
  const byStatus = d
    .prepare(
      `SELECT status, COUNT(*) AS n FROM conversations GROUP BY status`,
    )
    .all();
  const handoffFailed = d
    .prepare(`SELECT COUNT(*) AS n FROM handoffs WHERE status = 'failed'`)
    .get().n;
  const total = d.prepare(`SELECT COUNT(*) AS n FROM conversations`).get().n;
  return { total, byStatus, handoffFailed };
}

/**
 * Inbound event: dedup + find-or-create + reopen if CLOSED
 */
export function ingestEvent(body) {
  const channel = String(body.channel || "").trim();
  const sourceUserId = String(body.source_user_id || "").trim();
  const threadId = String(body.thread_id || "").trim();
  const sourceMessageId = String(body.source_message_id || "").trim();
  const text = body.text != null ? String(body.text) : null;
  const actor = body.actor || "system";

  if (!channel || !sourceUserId || !threadId) {
    throw bad("channel, source_user_id, thread_id required");
  }
  if (!sourceMessageId) {
    throw bad("source_message_id required for inbound dedup");
  }

  const d = getDb();
  const dup = d
    .prepare(
      `SELECT conversation_id FROM processed_messages
       WHERE channel = ? AND source_message_id = ?`,
    )
    .get(channel, sourceMessageId);
  if (dup) {
    const conv = getConversation(dup.conversation_id);
    return { duplicate: true, conversation: conv };
  }

  let conv = d
    .prepare(
      `SELECT * FROM conversations
       WHERE channel = ? AND source_user_id = ? AND thread_id = ?`,
    )
    .get(channel, sourceUserId, threadId);

  const ts = nowIso();
  let reopened = false;

  if (!conv) {
    const id = uuid();
    d.prepare(
      `INSERT INTO conversations
       (id, channel, source_user_id, thread_id, owner, status, version,
        last_message_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'none', 'NEW', 1, ?, ?, ?)`,
    ).run(id, channel, sourceUserId, threadId, ts, ts, ts);
    conv = getConversation(id);
    audit(id, "conversation.created", actor, { channel, sourceUserId, threadId });
  } else if (conv.status === "CLOSED") {
    d.prepare(
      `UPDATE conversations
       SET status = 'BOT_ACTIVE', close_reason = NULL, version = version + 1,
           last_message_at = ?, updated_at = ?
       WHERE id = ?`,
    ).run(ts, ts, conv.id);
    reopened = true;
    conv = getConversation(conv.id);
    audit(conv.id, "conversation.reopened", actor, { from: "CLOSED" });
  } else {
    d.prepare(
      `UPDATE conversations SET last_message_at = ?, updated_at = ? WHERE id = ?`,
    ).run(ts, ts, conv.id);
    conv = getConversation(conv.id);
  }

  d.prepare(
    `INSERT INTO processed_messages (channel, source_message_id, conversation_id, received_at)
     VALUES (?, ?, ?, ?)`,
  ).run(channel, sourceMessageId, conv.id, ts);

  if (text) {
    audit(conv.id, "message.inbound", actor, {
      source_message_id: sourceMessageId,
      text_preview: text.slice(0, 200),
    });
  }

  return { duplicate: false, reopened, conversation: conv };
}

export function claimOwnership(id, body) {
  const caller = String(body.caller || "").trim();
  const expectedVersion = body.version;
  if (!OWNERS.has(caller) || caller === "none") {
    throw bad("invalid caller");
  }
  const conv = getConversation(id);
  if (!conv) throw bad("conversation not found", 404);

  if (expectedVersion != null && Number(expectedVersion) !== conv.version) {
    throw bad(`version conflict: have ${conv.version}`, 409);
  }

  // Allow claim if none, same owner, or explicit force from human/gia_huy
  const force = body.force === true && (caller === "human" || caller === "gia_huy");
  if (
    conv.owner !== "none" &&
    conv.owner !== caller &&
    !force &&
    conv.status !== "CLOSED"
  ) {
    throw bad(`owned by ${conv.owner}`, 409);
  }

  const ts = nowIso();
  const newStatus =
    body.status && STATUSES.has(body.status)
      ? body.status
      : conv.status === "NEW" || conv.status === "CLOSED"
        ? "BOT_ACTIVE"
        : conv.status === "ASSIGNED" || conv.status === "HUMAN_ACTIVE"
          ? conv.status
          : "BOT_ACTIVE";

  dUpdateOwner(id, caller, newStatus, ts);
  const next = getConversation(id);
  audit(id, "ownership.claimed", caller, {
    previous_owner: conv.owner,
    status: next.status,
    version: next.version,
  });
  return next;
}

function dUpdateOwner(id, owner, status, ts) {
  getDb()
    .prepare(
      `UPDATE conversations
       SET owner = ?, status = ?, version = version + 1, updated_at = ?
       WHERE id = ?`,
    )
    .run(owner, status, ts, id);
}

/**
 * Authorize outbound send — enforce caller == owner + version/lease
 */
export function authorizeOutbound(id, body) {
  const caller = String(body.caller || "").trim();
  const version = body.version != null ? Number(body.version) : null;
  const idempotencyKey = String(body.idempotency_key || "").trim();
  if (!caller || !OWNERS.has(caller) || caller === "none") {
    throw bad("invalid caller");
  }
  if (!idempotencyKey) throw bad("idempotency_key required");

  const d = getDb();
  const existing = d
    .prepare(`SELECT * FROM outbound_log WHERE idempotency_key = ?`)
    .get(idempotencyKey);
  if (existing) {
    return {
      allowed: existing.status === "allowed" || existing.status === "sent",
      duplicate: true,
      outbound: existing,
    };
  }

  const conv = getConversation(id);
  if (!conv) throw bad("conversation not found", 404);
  if (conv.status === "CLOSED") {
    throw bad("conversation closed — reopen via inbound first", 409);
  }
  if (conv.owner !== caller) {
    throw bad(`caller ${caller} is not owner ${conv.owner}`, 409);
  }
  if (version != null && version !== conv.version) {
    throw bad(`version conflict: have ${conv.version}`, 409);
  }

  const ts = nowIso();
  const leaseId = uuid();
  const expires = new Date(Date.now() + LEASE_TTL_SEC * 1000).toISOString();
  d.prepare(
    `INSERT INTO send_leases (conversation_id, caller, lease_id, version, expires_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(conversation_id) DO UPDATE SET
       caller = excluded.caller,
       lease_id = excluded.lease_id,
       version = excluded.version,
       expires_at = excluded.expires_at`,
  ).run(id, caller, leaseId, conv.version, expires);

  const outId = uuid();
  d.prepare(
    `INSERT INTO outbound_log (id, conversation_id, caller, idempotency_key, status, payload_json, created_at)
     VALUES (?, ?, ?, ?, 'allowed', ?, ?)`,
  ).run(
    outId,
    id,
    caller,
    idempotencyKey,
    JSON.stringify({
      text: body.text ?? null,
      media: body.media ?? [],
      channel: body.channel ?? conv.channel,
      thread_id: body.thread_id ?? conv.thread_id,
    }),
    ts,
  );

  audit(id, "outbound.allowed", caller, {
    idempotency_key: idempotencyKey,
    lease_id: leaseId,
    expires_at: expires,
  });

  return {
    allowed: true,
    duplicate: false,
    lease_id: leaseId,
    expires_at: expires,
    version: conv.version,
    conversation: conv,
  };
}

export function createHandoff(body) {
  const conversationId = String(body.conversation_id || "").trim();
  const fromOwner = String(body.from_owner || "").trim();
  const toOwner = String(body.to_owner || "").trim();
  const idempotencyKey = String(body.idempotency_key || "").trim();
  if (!conversationId || !fromOwner || !toOwner || !idempotencyKey) {
    throw bad("conversation_id, from_owner, to_owner, idempotency_key required");
  }

  const d = getDb();
  const existing = d
    .prepare(`SELECT * FROM handoffs WHERE idempotency_key = ?`)
    .get(idempotencyKey);
  if (existing) return { duplicate: true, handoff: existing };

  const conv = getConversation(conversationId);
  if (!conv) throw bad("conversation not found", 404);
  if (conv.owner !== fromOwner && fromOwner !== "human" && fromOwner !== "gia_huy") {
    throw bad("from_owner is not current owner", 409);
  }

  // Consent gate: handoff to minh_phat for proactive Zalo requires grant
  if (toOwner === "minh_phat" && body.require_zalo_consent !== false) {
    const ok = hasActiveConsent(conversationId, "zalo");
    if (!ok && body.force !== true) {
      throw bad("zalo consent grant required before handoff to minh_phat", 409);
    }
  }

  const ts = nowIso();
  const id = uuid();
  d.prepare(
    `INSERT INTO handoffs
     (id, conversation_id, from_owner, to_owner, reason, status, idempotency_key, payload_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'accepted', ?, ?, ?, ?)`,
  ).run(
    id,
    conversationId,
    fromOwner,
    toOwner,
    body.reason ?? null,
    idempotencyKey,
    JSON.stringify(body.payload ?? {}),
    ts,
    ts,
  );

  const status =
    toOwner === "human" ? "HUMAN_ACTIVE" : toOwner === "none" ? conv.status : "ASSIGNED";
  d.prepare(
    `UPDATE conversations
     SET owner = ?, status = ?, version = version + 1, summary = COALESCE(?, summary), updated_at = ?
     WHERE id = ?`,
  ).run(toOwner, status, body.summary ?? null, ts, conversationId);

  audit(conversationId, "handoff.accepted", fromOwner, {
    to_owner: toOwner,
    handoff_id: id,
  });

  return {
    duplicate: false,
    handoff: d.prepare(`SELECT * FROM handoffs WHERE id = ?`).get(id),
    conversation: getConversation(conversationId),
  };
}

export function appendConsent(body) {
  const conversationId = String(body.conversation_id || "").trim();
  const type = String(body.type || "").trim();
  const purpose = String(body.purpose || "").trim();
  const action = String(body.action || "grant").trim();
  if (!conversationId || !type || !purpose) {
    throw bad("conversation_id, type, purpose required");
  }
  if (action !== "grant" && action !== "withdraw") {
    throw bad("action must be grant|withdraw");
  }
  if (!getConversation(conversationId)) throw bad("conversation not found", 404);

  const id = uuid();
  const ts = body.captured_at || nowIso();
  getDb()
    .prepare(
      `INSERT INTO consents
       (id, conversation_id, type, purpose, action, captured_at, source_message_id, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      conversationId,
      type,
      purpose,
      action,
      ts,
      body.source_message_id ?? null,
      body.note ?? null,
    );
  audit(conversationId, `consent.${action}`, body.actor || "system", {
    type,
    purpose,
    consent_id: id,
  });
  return getDb().prepare(`SELECT * FROM consents WHERE id = ?`).get(id);
}

export function hasActiveConsent(conversationId, type) {
  const row = getDb()
    .prepare(
      `SELECT action FROM consents
       WHERE conversation_id = ? AND type = ?
       ORDER BY captured_at DESC LIMIT 1`,
    )
    .get(conversationId, type);
  return row?.action === "grant";
}

export function closeConversation(id, body) {
  const conv = getConversation(id);
  if (!conv) throw bad("conversation not found", 404);
  const ts = nowIso();
  getDb()
    .prepare(
      `UPDATE conversations
       SET status = 'CLOSED', close_reason = ?, owner = 'none',
           version = version + 1, updated_at = ?
       WHERE id = ?`,
    )
    .run(body.close_reason ?? "other", ts, id);
  audit(id, "conversation.closed", body.actor || "system", {
    close_reason: body.close_reason ?? "other",
  });
  return getConversation(id);
}

export function upsertWatchSnapshot(sourceUrl, contentHash, excerpt) {
  const ts = nowIso();
  const d = getDb();
  const prev = d
    .prepare(`SELECT * FROM watch_snapshots WHERE source_url = ?`)
    .get(sourceUrl);
  d.prepare(
    `INSERT INTO watch_snapshots (source_url, content_hash, excerpt, fetched_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(source_url) DO UPDATE SET
       content_hash = excluded.content_hash,
       excerpt = excluded.excerpt,
       fetched_at = excluded.fetched_at`,
  ).run(sourceUrl, contentHash, excerpt ?? null, ts);
  return {
    changed: !prev || prev.content_hash !== contentHash,
    previous_hash: prev?.content_hash ?? null,
    content_hash: contentHash,
    fetched_at: ts,
  };
}

export function listWatchSnapshots() {
  return getDb().prepare(`SELECT * FROM watch_snapshots ORDER BY source_url`).all();
}
