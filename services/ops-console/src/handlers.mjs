import { ensureSeed, loadStore, nowIso, saveStore, uuid } from "./db.mjs";

/** Idle seconds before auto-resume from human_paused (not pinned). Demo default 60s. */
export const IDLE_SEC = Number(process.env.OPS_IDLE_SEC || 60);

export function getConfig() {
  return {
    idle_sec: IDLE_SEC,
    idle_label:
      IDLE_SEC < 120
        ? `${IDLE_SEC}s (demo — production ~5–10 phút)`
        : `${Math.round(IDLE_SEC / 60)} phút`,
    modes: ["ai_active", "human_paused", "human_pinned"],
  };
}

function store() {
  return ensureSeed(loadStore());
}

function touch(thread, at = nowIso()) {
  thread.last_activity_at = at;
  thread.updated_at = at;
}

function audit(s, threadPk, type, actor, detail = {}) {
  s.events.unshift({
    id: uuid(),
    thread_pk: threadPk,
    type,
    actor: actor || "system",
    detail,
    at: nowIso(),
  });
  s.events = s.events.slice(0, 500);
}

export function listThreads() {
  const s = store();
  // auto-resume tick on list (cheap)
  tickAutoResume(s);
  const list = s.threads
    .map((t) => enrich(s, t))
    .sort((a, b) => (a.last_activity_at < b.last_activity_at ? 1 : -1));
  return { threads: list, config: getConfig() };
}

function enrich(s, t) {
  const msgs = s.messages.filter((m) => m.thread_pk === t.id);
  const last = msgs[msgs.length - 1];
  let resume_in_sec = null;
  if (t.ai_mode === "human_paused" && t.last_activity_at) {
    const elapsed = (Date.now() - new Date(t.last_activity_at).getTime()) / 1000;
    resume_in_sec = Math.max(0, Math.ceil(IDLE_SEC - elapsed));
  }
  return {
    ...t,
    message_count: msgs.length,
    last_preview: last?.text || t.last_preview,
    resume_in_sec,
    ai_should_reply: t.ai_mode === "ai_active",
  };
}

export function getThread(id) {
  const s = store();
  tickAutoResume(s);
  const t = s.threads.find((x) => x.id === id);
  if (!t) {
    const e = new Error("thread not found");
    e.status = 404;
    throw e;
  }
  const messages = s.messages
    .filter((m) => m.thread_pk === id)
    .sort((a, b) => (a.at < b.at ? -1 : 1));
  return { thread: enrich(s, t), messages, config: getConfig() };
}

/** Sale takes over → human_paused (auto-resume after idle) */
export function takeover(id, body = {}) {
  const s = store();
  const t = s.threads.find((x) => x.id === id);
  if (!t) {
    const e = new Error("thread not found");
    e.status = 404;
    throw e;
  }
  const actor = body.actor || "sale";
  const pin = Boolean(body.pin);
  t.ai_mode = pin ? "human_pinned" : "human_paused";
  t.paused_at = nowIso();
  t.paused_by = actor;
  touch(t);
  audit(s, id, pin ? "human_pinned" : "takeover", actor, {});
  saveStore(s);
  return { thread: enrich(s, t) };
}

/** Explicit return to AI */
export function resumeAi(id, body = {}) {
  const s = store();
  const t = s.threads.find((x) => x.id === id);
  if (!t) {
    const e = new Error("thread not found");
    e.status = 404;
    throw e;
  }
  const actor = body.actor || "sale";
  const prev = t.ai_mode;
  t.ai_mode = "ai_active";
  t.paused_at = null;
  t.paused_by = null;
  touch(t);
  audit(s, id, "resume_ai", actor, { from: prev });
  saveStore(s);
  return { thread: enrich(s, t) };
}

/** Pin human — no auto-resume until sale opens AI */
export function pinHuman(id, body = {}) {
  return takeover(id, { ...body, pin: true });
}

/**
 * Sale sends message as bot (demo: store only).
 * Real Zalo send hooks later via zaloclaw.
 * Sending while ai_active auto-pauses (takeover).
 */
export function sendAsBot(id, body = {}) {
  const s = store();
  const t = s.threads.find((x) => x.id === id);
  if (!t) {
    const e = new Error("thread not found");
    e.status = 404;
    throw e;
  }
  const text = String(body.text || "").trim();
  if (!text) {
    const e = new Error("text required");
    e.status = 400;
    throw e;
  }
  const actor = body.actor || "sale";
  const at = nowIso();

  if (t.ai_mode === "ai_active") {
    t.ai_mode = "human_paused";
    t.paused_at = at;
    t.paused_by = actor;
    audit(s, id, "auto_pause_on_send", actor, {});
  }

  const msg = {
    id: uuid(),
    thread_pk: id,
    role: "sale",
    text,
    at,
    actor,
    // demo flag — production: sent via zaloclaw
    delivery: "demo_local",
  };
  s.messages.push(msg);
  t.last_preview = text;
  touch(t, at);
  audit(s, id, "sale_send", actor, { text: text.slice(0, 120) });
  saveStore(s);
  return { message: msg, thread: enrich(s, t) };
}

/** Simulate customer message (demo) */
export function simCustomer(id, body = {}) {
  const s = store();
  const t = s.threads.find((x) => x.id === id);
  if (!t) {
    const e = new Error("thread not found");
    e.status = 404;
    throw e;
  }
  const text = String(body.text || "Khách nhắn demo…").trim();
  const at = nowIso();
  const msg = {
    id: uuid(),
    thread_pk: id,
    role: "customer",
    text,
    at,
  };
  s.messages.push(msg);
  t.last_preview = text;
  touch(t, at);

  // If AI active, optionally append fake AI reply for demo UX
  let aiMsg = null;
  if (t.ai_mode === "ai_active" && body.auto_ai !== false) {
    aiMsg = {
      id: uuid(),
      thread_pk: id,
      role: "ai",
      text: `[AI demo] Dạ em nhận được: “${text.slice(0, 80)}”. Em hỗ trợ tiếp ạ.`,
      at: new Date(Date.now() + 500).toISOString(),
    };
    s.messages.push(aiMsg);
    t.last_preview = aiMsg.text;
    touch(t, aiMsg.at);
  } else if (t.ai_mode !== "ai_active") {
    audit(s, id, "customer_while_paused", "customer", { text: text.slice(0, 80) });
  }

  saveStore(s);
  return {
    message: msg,
    ai_message: aiMsg,
    thread: enrich(s, t),
    ai_replied: Boolean(aiMsg),
  };
}

/** Gateway hook: may AI reply on this thread_id + bot? */
export function aiAllowed(query = {}) {
  const s = store();
  tickAutoResume(s);
  const threadId = String(query.thread_id || "").trim();
  const bot = String(query.bot || "").trim();
  let t = null;
  if (threadId) {
    t = s.threads.find(
      (x) => x.thread_id === threadId && (!bot || x.bot === bot),
    );
  }
  if (!t && query.id) {
    t = s.threads.find((x) => x.id === query.id);
  }
  if (!t) {
    // unknown thread → AI allowed (default AI-first)
    return { allowed: true, reason: "unknown_thread_default_ai", mode: "ai_active" };
  }
  return {
    allowed: t.ai_mode === "ai_active",
    reason: t.ai_mode,
    mode: t.ai_mode,
    thread_id: t.thread_id,
    resume_in_sec:
      t.ai_mode === "human_paused"
        ? Math.max(
            0,
            Math.ceil(
              IDLE_SEC - (Date.now() - new Date(t.last_activity_at).getTime()) / 1000,
            ),
          )
        : null,
  };
}

export function tickAutoResume(s = null) {
  const owned = !s;
  const storeRef = s || store();
  let changed = false;
  const now = Date.now();
  for (const t of storeRef.threads) {
    if (t.ai_mode !== "human_paused") continue;
    const last = new Date(t.last_activity_at || t.paused_at || 0).getTime();
    if (now - last >= IDLE_SEC * 1000) {
      t.ai_mode = "ai_active";
      t.paused_at = null;
      t.paused_by = null;
      t.updated_at = nowIso();
      audit(storeRef, t.id, "auto_resume", "system", { idle_sec: IDLE_SEC });
      changed = true;
    }
  }
  if (changed) saveStore(storeRef);
  return { changed };
}

export function listEvents(limit = 50) {
  const s = store();
  return { events: s.events.slice(0, limit) };
}

export function resetDemo() {
  const s = { threads: [], messages: [], events: [], meta: { version: 1, created_at: nowIso() } };
  ensureSeed(s);
  return listThreads();
}
