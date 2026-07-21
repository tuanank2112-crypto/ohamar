import { getDb, nowIso, uuid } from "./db.mjs";

export function audit(conversationId, eventType, actor, detail = {}) {
  const d = getDb();
  d.prepare(
    `INSERT INTO audit_events (id, conversation_id, event_type, actor, detail_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    uuid(),
    conversationId ?? null,
    eventType,
    actor ?? null,
    JSON.stringify(detail),
    nowIso(),
  );
}
