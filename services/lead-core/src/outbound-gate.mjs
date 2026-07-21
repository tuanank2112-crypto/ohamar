#!/usr/bin/env node
/**
 * Hard gate before any channel send.
 *
 * Usage:
 *   node src/outbound-gate.mjs \
 *     --caller minh_phat \
 *     --channel zalo_worker \
 *     --user-id <uid> \
 *     --thread-id <tid> \
 *     --message-id <inbound_or_cli_id> \
 *     --text "reply text" \
 *     [--claim] \
 *     [--json]
 *
 * Exit 0 + prints ALLOWED JSON if Core authorizes.
 * Exit 2 if denied (409) — DO NOT send.
 * Exit 1 on other errors.
 */
import { claim, ingestEvent, outbound } from "./client.mjs";

function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return def;
  return process.argv[i + 1] ?? def;
}
function flag(name) {
  return process.argv.includes(`--${name}`);
}

const caller = arg("caller");
const channel = arg("channel");
const userId = arg("user-id");
const threadId = arg("thread-id");
const messageId = arg("message-id") || `gate-${Date.now()}`;
const text = arg("text") || "";
const doClaim = flag("claim");
const asJson = flag("json");

if (!caller || !channel || !userId || !threadId) {
  console.error(
    "Usage: outbound-gate --caller <id> --channel <ch> --user-id <u> --thread-id <t> [--text ...] [--claim]",
  );
  process.exit(1);
}

try {
  const ev = await ingestEvent({
    channel,
    source_user_id: userId,
    thread_id: threadId,
    source_message_id: `gate-in-${messageId}`,
    text: text ? `[outbound-gate context] ${text.slice(0, 80)}` : null,
    actor: caller,
  });
  let conv = ev.conversation;
  if (doClaim || conv.owner === "none" || conv.owner === caller) {
    const c = await claim(conv.id, { caller, version: conv.version });
    conv = c.conversation || c;
  }

  const out = await outbound(conv.id, {
    caller,
    version: conv.version,
    idempotency_key: `out:${channel}:${threadId}:${messageId}`,
    text,
    channel,
    thread_id: threadId,
  });

  if (!out.allowed) {
    if (asJson) console.log(JSON.stringify({ ok: false, ...out }, null, 2));
    else console.error("DENIED", out);
    process.exit(2);
  }

  const result = {
    ok: true,
    conversation_id: conv.id,
    version: out.version ?? conv.version,
    lease_id: out.lease_id,
    expires_at: out.expires_at,
    duplicate: out.duplicate || false,
  };
  if (asJson) console.log(JSON.stringify(result, null, 2));
  else console.log("ALLOWED", result.conversation_id, result.lease_id);
  process.exit(0);
} catch (e) {
  const status = e.status || 1;
  if (asJson) {
    console.log(JSON.stringify({ ok: false, error: e.message, status }, null, 2));
  } else {
    console.error("GATE_ERROR", e.message);
  }
  process.exit(status === 409 ? 2 : 1);
}
