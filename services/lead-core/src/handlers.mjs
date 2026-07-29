import { getDb, nowIso, tx, uuid } from "./db.mjs";
import { audit } from "./audit.mjs";
import {
  CLAIMABLE_STATUSES,
  IDENTITIES,
  LEASE_TTL_SEC,
  OWNERS,
} from "./config.mjs";

function bad(msg, code = 400) {
  const e = new Error(msg);
  e.status = code;
  return e;
}

/**
 * Rút ra danh tính ĐÃ XÁC THỰC từ ctx (do tầng HTTP đặt vào), và từ chối nếu
 * body tự khai một caller khác.
 *
 * - ctx.identity == null  -> gọi trực tiếp trong process (script, cron, test).
 *   Trả về null; các handler sẽ lùi về body.caller như trước. HTTP KHÔNG BAO GIỜ
 *   đi vào nhánh này vì server.mjs luôn truyền identity.
 * - ctx.identity không thuộc IDENTITIES -> 403.
 * - body.caller != ctx.identity         -> 403 (đây là lỗ hổng C1).
 */
function resolveIdentity(ctx, body) {
  const raw =
    ctx && ctx.identity != null && ctx.identity !== ""
      ? String(ctx.identity).trim()
      : "";
  if (!raw) return null;
  if (!IDENTITIES.has(raw)) {
    throw bad(`unknown identity: ${raw}`, 403);
  }
  const claimed = body && body.caller != null ? String(body.caller).trim() : "";
  if (claimed && claimed !== raw) {
    throw bad(
      `body.caller "${claimed}" không khớp identity đã xác thực "${raw}"`,
      403,
    );
  }
  return raw;
}

export function getConversation(id) {
  return getDb().prepare(`SELECT * FROM conversations WHERE id = ?`).get(id);
}

export function metrics() {
  const d = getDb();
  const byStatus = d
    .prepare(`SELECT status, COUNT(*) AS n FROM conversations GROUP BY status`)
    .all();
  const handoffFailed = d
    .prepare(`SELECT COUNT(*) AS n FROM handoffs WHERE status = 'failed'`)
    .get().n;
  const total = d.prepare(`SELECT COUNT(*) AS n FROM conversations`).get().n;
  return { total, byStatus, handoffFailed };
}

/**
 * Inbound event: dedup + find-or-create + reopen if CLOSED.
 * G9: toàn bộ bước ghi nằm trong 1 transaction.
 */
export function ingestEvent(body, ctx = {}) {
  const identity = resolveIdentity(ctx, body);
  const channel = String(body.channel || "").trim();
  const sourceUserId = String(body.source_user_id || "").trim();
  const threadId = String(body.thread_id || "").trim();
  const sourceMessageId = String(body.source_message_id || "").trim();
  const text = body.text != null ? String(body.text) : null;
  const actor = identity || body.actor || "system";

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
    return { duplicate: true, conversation: getConversation(dup.conversation_id) };
  }

  return tx(() => {
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
  });
}

export function claimOwnership(id, body, ctx = {}) {
  const identity = resolveIdentity(ctx, body);
  const caller = identity || String(body.caller || "").trim();
  const expectedVersion = body.version;

  if (!IDENTITIES.has(caller)) {
    throw bad("invalid caller");
  }

  // G1: force chỉ dành cho identity ĐÃ XÁC THỰC là human. Trước đây chỉ cần
  // khai body.caller = "human" | "gia_huy" là chiếm được conversation bất kỳ.
  const wantsForce = body.force === true;
  if (wantsForce && identity !== "human") {
    throw bad(
      "force claim yêu cầu identity đã xác thực là 'human' (không nhận body.caller)",
      403,
    );
  }

  const conv = getConversation(id);
  if (!conv) throw bad("conversation not found", 404);

  if (expectedVersion != null && Number(expectedVersion) !== conv.version) {
    throw bad(`version conflict: have ${conv.version}`, 409);
  }

  if (
    conv.owner !== "none" &&
    conv.owner !== caller &&
    !wantsForce &&
    conv.status !== "CLOSED"
  ) {
    throw bad(`owned by ${conv.owner}`, 409);
  }

  // P3: client CHỈ được đặt các status "đang hoạt động". Cấm đặt CLOSED/NEW
  // qua claim để không bỏ qua luồng đóng (audit + reset owner) hoặc tua ngược.
  if (body.status != null && !CLAIMABLE_STATUSES.has(body.status)) {
    throw bad(
      `claim không được đặt status "${body.status}" ` +
      `(chỉ cho phép: ${[...CLAIMABLE_STATUSES].join(", ")})`,
    );
  }

  const ts = nowIso();
  const newStatus =
    body.status && CLAIMABLE_STATUSES.has(body.status)
      ? body.status
      : conv.status === "NEW" || conv.status === "CLOSED"
        ? "BOT_ACTIVE"
        : conv.status === "ASSIGNED" || conv.status === "HUMAN_ACTIVE"
          ? conv.status
          : "BOT_ACTIVE";

  dUpdateOwner(id, caller, newStatus, ts);
  const next = getConversation(id);
  audit(id, wantsForce ? "ownership.force_claimed" : "ownership.claimed", caller, {
    previous_owner: conv.owner,
    status: next.status,
    version: next.version,
    forced: wantsForce,
    authenticated: Boolean(identity),
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
 * Authorize outbound send — enforce caller == owner + version + lease.
 */
export function authorizeOutbound(id, body, ctx = {}) {
  const identity = resolveIdentity(ctx, body);
  const caller = identity || String(body.caller || "").trim();
  const version = body.version != null ? Number(body.version) : null;
  const idempotencyKey = String(body.idempotency_key || "").trim();

  if (!IDENTITIES.has(caller)) throw bad("invalid caller");
  if (!idempotencyKey) throw bad("idempotency_key required");

  const d = getDb();
  const existing = d
    .prepare(`SELECT * FROM outbound_log WHERE idempotency_key = ?`)
    .get(idempotencyKey);
  if (existing) {
    // Idempotency key phải gắn ĐÚNG conversation đã tạo ra nó. Nếu không,
    // reuse key ở conversation khác sẽ nhận nhầm kết quả của conversation cũ.
    if (existing.conversation_id !== id) {
      audit(id, "outbound.idempotency_conflict", caller, {
        idempotency_key: idempotencyKey,
        expected_conversation: existing.conversation_id,
      });
      return {
        allowed: false,
        duplicate: true,
        reason: "idempotency_key thuộc conversation khác",
        outbound: null,
      };
    }
    // G6: nhánh duplicate trước đây trả về TRƯỚC khi kiểm tra owner, nên caller
    // khác có thể dùng lại key của người khác để đọc payload và được allowed.
    if (existing.caller !== caller) {
      audit(id, "outbound.idempotency_conflict", caller, {
        idempotency_key: idempotencyKey,
        original_caller: existing.caller,
      });
      return {
        allowed: false,
        duplicate: true,
        reason: "idempotency_key thuộc về caller khác",
        outbound: null,
      };
    }
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

  return tx(() => {
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
  });
}

/**
 * G8: lease trước đây được GHI nhưng không hàm nào ĐỌC. Hàm này cho phép
 * tầng gửi (send.mjs / outbound-gate.mjs) xác nhận lease còn hiệu lực ngay
 * trước khi thực sự gọi Zalo.
 */
export function validateLease(conversationId, leaseId, caller) {
  const row = getDb()
    .prepare(`SELECT * FROM send_leases WHERE conversation_id = ?`)
    .get(conversationId);
  if (!row) return { valid: false, reason: "no_lease" };
  if (row.lease_id !== leaseId) return { valid: false, reason: "lease_superseded" };
  if (caller != null && row.caller !== caller) {
    return { valid: false, reason: "lease_belongs_to_other_caller" };
  }
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    return { valid: false, reason: "lease_expired", expires_at: row.expires_at };
  }
  const conv = getConversation(conversationId);
  if (!conv) return { valid: false, reason: "conversation_missing" };
  if (conv.owner !== row.caller) {
    return { valid: false, reason: "owner_changed", owner: conv.owner };
  }
  if (conv.version !== row.version) {
    return { valid: false, reason: "version_changed", version: conv.version };
  }
  return { valid: true, lease: row };
}

/**
 * P4/G8: tiêu thụ lease theo kiểu single-use ngay tại thời điểm gửi.
 * Chạy validateLease trong một transaction; nếu hợp lệ thì XOÁ lease để
 * không thể dùng lại (chống replay + chống gửi bằng lease đã bị thay thế).
 * Trả về cùng shape với validateLease, kèm consumed:true khi đã đốt lease.
 */
export function consumeLease(conversationId, leaseId, caller) {
  const d = getDb();
  return tx(() => {
    const check = validateLease(conversationId, leaseId, caller);
    if (!check.valid) {
      audit(conversationId, "lease.rejected", caller ?? null, {
        lease_id: leaseId,
        reason: check.reason,
      });
      return check;
    }
    d.prepare(
      `DELETE FROM send_leases WHERE conversation_id = ? AND lease_id = ?`,
    ).run(conversationId, leaseId);
    audit(conversationId, "lease.consumed", caller ?? null, {
      lease_id: leaseId,
    });
    return { ...check, consumed: true };
  });
}

export function createHandoff(body, ctx = {}) {
  const identity = resolveIdentity(ctx, body);
  const conversationId = String(body.conversation_id || "").trim();
  const fromOwner = String(body.from_owner || "").trim();
  const toOwner = String(body.to_owner || "").trim();
  const idempotencyKey = String(body.idempotency_key || "").trim();

  if (!conversationId || !fromOwner || !toOwner || !idempotencyKey) {
    throw bad("conversation_id, from_owner, to_owner, idempotency_key required");
  }

  // G3: trước đây to_owner được ghi thẳng vào conversations.owner mà không
  // validate, nên ghi được giá trị rác vào DB.
  if (!OWNERS.has(fromOwner)) throw bad(`invalid from_owner: ${fromOwner}`);
  if (!OWNERS.has(toOwner)) throw bad(`invalid to_owner: ${toOwner}`);

  const d = getDb();
  const existing = d
    .prepare(`SELECT * FROM handoffs WHERE idempotency_key = ?`)
    .get(idempotencyKey);
  if (existing) {
    // Idempotency key phải gắn đúng conversation đã tạo ra nó.
    if (existing.conversation_id !== conversationId) {
      throw bad("idempotency_key thuộc conversation khác", 409);
    }
    // Không tiết lộ bản ghi handoff cho một identity đã xác thực không liên quan.
    if (
      identity &&
      identity !== existing.from_owner &&
      identity !== existing.to_owner &&
      identity !== "human"
    ) {
      throw bad(`identity "${identity}" không được truy cập handoff này`, 403);
    }
    return { duplicate: true, handoff: existing };
  }

  const conv = getConversation(conversationId);
  if (!conv) throw bad("conversation not found", 404);

  // G2: điều kiện cũ có ngoại lệ `fromOwner !== "human" && fromOwner !== "gia_huy"`
  // nghĩa là chỉ cần khai from_owner = gia_huy là bỏ qua hoàn toàn kiểm tra owner.
  if (conv.owner !== fromOwner) {
    throw bad(
      `from_owner "${fromOwner}" không phải chủ sở hữu hiện tại "${conv.owner}"`,
      409,
    );
  }
  if (identity && identity !== fromOwner && identity !== "human") {
    throw bad(
      `identity "${identity}" không được tạo handoff thay cho "${fromOwner}"`,
      403,
    );
  }

  // G4: cổng consent Zalo. Trước đây client tắt được bằng require_zalo_consent:false
  // hoặc force:true. Giờ cờ của client bị BỎ QUA hoàn toàn, và force chỉ
  // dành cho identity đã xác thực là human, luôn kèm audit.
  if (body.require_zalo_consent !== undefined) {
    audit(conversationId, "consent.gate.client_flag_ignored", identity || "unknown", {
      require_zalo_consent: body.require_zalo_consent,
    });
  }
  if (toOwner === "minh_phat") {
    const ok = hasActiveConsent(conversationId, "zalo");
    if (!ok) {
      const override = body.force === true && identity === "human";
      if (!override) {
        throw bad("zalo consent grant required before handoff to minh_phat", 409);
      }
      audit(conversationId, "consent.gate.overridden", identity, {
        to_owner: toOwner,
        reason: body.reason ?? null,
        idempotency_key: idempotencyKey,
      });
    }
  }

  const ts = nowIso();
  const id = uuid();
  const status =
    toOwner === "human"
      ? "HUMAN_ACTIVE"
      : toOwner === "none"
        ? conv.status
        : "ASSIGNED";

  return tx(() => {
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

    d.prepare(
      `UPDATE conversations
       SET owner = ?, status = ?, version = version + 1, summary = COALESCE(?, summary), updated_at = ?
       WHERE id = ?`,
    ).run(toOwner, status, body.summary ?? null, ts, conversationId);

    audit(conversationId, "handoff.accepted", identity || fromOwner, {
      from_owner: fromOwner,
      to_owner: toOwner,
      handoff_id: id,
    });

    return {
      duplicate: false,
      handoff: d.prepare(`SELECT * FROM handoffs WHERE id = ?`).get(id),
      conversation: getConversation(conversationId),
    };
  });
}

export function appendConsent(body, ctx = {}) {
  const identity = resolveIdentity(ctx, body);
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
  // G5: captured_at TRƯỚC ĐÂY do client quyết định. Đặt một grant ở năm 9999
  // sẽ khiến mọi withdraw về sau không bao giờ thắng trong ORDER BY captured_at.
  // Bây giờ luôn dùng thời gian server; giá trị client gửi chỉ được lưu để đối chiếu.
  const ts = nowIso();
  const clientTs = body.captured_at ? String(body.captured_at) : null;

  getDb()
    .prepare(
      `INSERT INTO consents
 (id, conversation_id, type, purpose, action, captured_at, client_captured_at, source_message_id, note)
 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      conversationId,
      type,
      purpose,
      action,
      ts,
      clientTs,
      body.source_message_id ?? null,
      body.note ?? null,
    );

  audit(conversationId, `consent.${action}`, identity || body.actor || "system", {
    type,
    purpose,
    consent_id: id,
    captured_at: ts,
    client_captured_at: clientTs,
  });
  return getDb().prepare(`SELECT * FROM consents WHERE id = ?`).get(id);
}

export function hasActiveConsent(conversationId, type) {
  // rowid DESC làm tie-break: nhiều bản ghi trong cùng một mili-giây vẫn có
  // thứ tự xác định theo thứ tự ghi.
  const row = getDb()
    .prepare(
      `SELECT action FROM consents
       WHERE conversation_id = ? AND type = ?
       ORDER BY captured_at DESC, rowid DESC LIMIT 1`,
    )
    .get(conversationId, type);
  return row?.action === "grant";
}

export function closeConversation(id, body = {}, ctx = {}) {
  // G7: trước đây không hề kiểm tra danh tính — bất kỳ ai có token đều đóng được.
  const identity = resolveIdentity(ctx, body);
  const conv = getConversation(id);
  if (!conv) throw bad("conversation not found", 404);

  if (
    identity &&
    conv.owner !== "none" &&
    identity !== conv.owner &&
    identity !== "human"
  ) {
    throw bad(
      `identity "${identity}" không được đóng conversation của "${conv.owner}"`,
      403,
    );
  }

  const ts = nowIso();
  getDb()
    .prepare(
      `UPDATE conversations
       SET status = 'CLOSED', close_reason = ?, owner = 'none',
           version = version + 1, updated_at = ?
       WHERE id = ?`,
    )
    .run(body.close_reason ?? "other", ts, id);
  audit(id, "conversation.closed", identity || body.actor || "system", {
    close_reason: body.close_reason ?? "other",
    previous_owner: conv.owner,
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