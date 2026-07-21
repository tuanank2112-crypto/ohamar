/**
 * Optional Lead Core bridge (Ohamar multi-channel).
 * Enable with LEAD_CORE_ENFORCE=1 and LEAD_CORE_TOKEN.
 * Fail-closed on outbound when enforce is on and Core rejects.
 */

export type LeadCoreConfig = {
  enabled: boolean;
  enforce: boolean;
  baseUrl: string;
  token: string;
  caller: string;
  channel: string;
};

function env(name: string, def = ""): string {
  return (process.env[name] || def).trim();
}

export function getLeadCoreConfig(): LeadCoreConfig {
  const token = env("LEAD_CORE_TOKEN");
  const enforce = ["1", "true", "yes", "on"].includes(
    env("LEAD_CORE_ENFORCE", "0").toLowerCase(),
  );
  const enabled =
    enforce ||
    ["1", "true", "yes", "on"].includes(env("LEAD_CORE_ENABLED", "0").toLowerCase());
  const instance = env("OHAMAR_INSTANCE", "main").toLowerCase();
  const isWorker = instance === "worker";
  return {
    enabled: enabled && Boolean(token),
    enforce,
    baseUrl: env("LEAD_CORE_URL", "http://127.0.0.1:18792").replace(/\/$/, ""),
    token,
    caller: env("LEAD_CORE_CALLER", isWorker ? "minh_phat" : "gia_huy"),
    channel: env("LEAD_CORE_CHANNEL", isWorker ? "zalo_worker" : "zalo_main"),
  };
}

async function api(
  cfg: LeadCoreConfig,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; json: any }> {
  const r = await fetch(`${cfg.baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json: any = {};
  try {
    json = await r.json();
  } catch {
    /* empty */
  }
  return { ok: r.ok, status: r.status, json };
}

/** Inbound: best-effort ingest (never block monitor if Core down unless enforce). */
export async function leadCoreIngestInbound(params: {
  isGroup: boolean;
  chatId: string;
  senderId: string;
  messageId: string;
  text: string;
}): Promise<void> {
  const cfg = getLeadCoreConfig();
  if (!cfg.enabled) return;
  try {
    const sourceUserId = params.isGroup ? "__group__" : params.senderId;
    await api(cfg, "POST", "/v1/events", {
      channel: cfg.channel,
      source_user_id: sourceUserId,
      thread_id: params.chatId,
      source_message_id: params.messageId || `zalo-${Date.now()}`,
      text: params.text?.slice(0, 500) ?? null,
      actor: cfg.caller,
    });
  } catch (e) {
    console.warn(
      `[zaloclaw] lead-core ingest failed: ${e instanceof Error ? e.message : e}`,
    );
    if (cfg.enforce) {
      // still allow inbound processing when Core is down? fail-open for receive
    }
  }
}

/**
 * Outbound gate. Returns null if allowed (or Core disabled).
 * Returns error string if blocked.
 */
export async function leadCoreAuthorizeOutbound(params: {
  isGroup?: boolean;
  threadId: string;
  peerUserId?: string;
  text: string;
  messageKey?: string;
}): Promise<string | null> {
  const cfg = getLeadCoreConfig();
  if (!cfg.enabled) return null;
  if (!cfg.enforce) {
    // soft mode: try authorize but don't block
    try {
      await authorize(cfg, params);
    } catch {
      /* ignore */
    }
    return null;
  }
  try {
    await authorize(cfg, params);
    return null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[zaloclaw] lead-core outbound DENIED: ${msg}`);
    return msg;
  }
}

async function authorize(
  cfg: LeadCoreConfig,
  params: {
    isGroup?: boolean;
    threadId: string;
    peerUserId?: string;
    text: string;
    messageKey?: string;
  },
): Promise<void> {
  const threadId = params.threadId.trim();
  const sourceUserId = params.isGroup
    ? "__group__"
    : (params.peerUserId || threadId).trim();
  const msgKey =
    params.messageKey ||
    `out-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // ensure conversation exists
  const ev = await api(cfg, "POST", "/v1/events", {
    channel: cfg.channel,
    source_user_id: sourceUserId,
    thread_id: threadId,
    source_message_id: `pre-out-${msgKey}`,
    text: null,
    actor: cfg.caller,
  });
  if (!ev.ok) {
    throw new Error(ev.json?.error || `events HTTP ${ev.status}`);
  }
  let conv = ev.json.conversation;
  if (!conv?.id) throw new Error("no conversation from lead-core");

  // auto-claim if none or self
  if (conv.owner === "none" || conv.owner === cfg.caller) {
    const cl = await api(cfg, "POST", `/v1/conversations/${conv.id}/claim`, {
      caller: cfg.caller,
      version: conv.version,
    });
    if (cl.ok && cl.json.conversation) conv = cl.json.conversation;
    else if (!cl.ok && cl.status === 409) {
      throw new Error(cl.json?.error || "claim denied");
    }
  }

  const out = await api(cfg, "POST", `/v1/conversations/${conv.id}/outbound`, {
    caller: cfg.caller,
    version: conv.version,
    idempotency_key: `zaloclaw:${cfg.channel}:${threadId}:${msgKey}`,
    text: params.text?.slice(0, 500) ?? "",
    channel: cfg.channel,
    thread_id: threadId,
  });
  if (!out.ok) {
    throw new Error(out.json?.error || `outbound HTTP ${out.status}`);
  }
  if (out.json.allowed === false) {
    throw new Error("outbound not allowed");
  }
}
