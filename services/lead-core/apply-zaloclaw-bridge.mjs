#!/usr/bin/env node
/**
 * Apply Lead Core bridge into vendor/zaloclaw and rebuild dist.
 * Run after clone / on feature branch setup.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const vendor = path.join(root, "vendor/zaloclaw");
const srcBridge = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "patches/zaloclaw/lead-core-bridge.ts",
);
const destBridge = path.join(vendor, "src/runtime/lead-core-bridge.ts");

if (!fs.existsSync(vendor)) {
  console.error("vendor/zaloclaw missing");
  process.exit(1);
}

fs.mkdirSync(path.dirname(destBridge), { recursive: true });
fs.copyFileSync(srcBridge, destBridge);
console.log("✓ wrote", path.relative(root, destBridge));

// Patch send.ts if not already
const sendPath = path.join(vendor, "src/channel/send.ts");
let send = fs.readFileSync(sendPath, "utf8");
if (!send.includes("leadCoreAuthorizeOutbound")) {
  if (!send.includes('from "../runtime/lead-core-bridge.js"')) {
    send = send.replace(
      'import { redactOutput } from "../safety/output-filter.js";\n',
      'import { redactOutput } from "../safety/output-filter.js";\nimport { leadCoreAuthorizeOutbound } from "../runtime/lead-core-bridge.js";\n',
    );
  }
  if (!send.includes("Lead Core enforce")) {
    send = send.replace(
      `if (!threadId?.trim()) return { ok: false, error: "No threadId provided" };

  const dedupKey = sendDedupKey(threadId, text || "", options);`,
      `if (!threadId?.trim()) return { ok: false, error: "No threadId provided" };

  // Lead Core enforce (Ohamar multi-channel) — fail closed when DENIED
  const gateErr = await leadCoreAuthorizeOutbound({
    isGroup: Boolean(options.isGroup),
    threadId: threadId.trim(),
    text: text || options.caption || "",
    messageKey: \`\${Date.now()}\`,
  });
  if (gateErr) {
    return {
      ok: false,
      error: \`Lead Core blocked send: \${gateErr}\`,
    };
  }

  const dedupKey = sendDedupKey(threadId, text || "", options);`,
    );
  }
  fs.writeFileSync(sendPath, send);
  console.log("✓ patched send.ts");
} else {
  console.log("· send.ts already bridged");
}

// Patch monitor.ts
const monPath = path.join(vendor, "src/channel/monitor.ts");
let mon = fs.readFileSync(monPath, "utf8");
if (!mon.includes("leadCoreIngestInbound")) {
  mon = mon.replace(
    'import { getApi, getCurrentUid } from "../client/zalo-client.js";\n',
    'import { getApi, getCurrentUid } from "../client/zalo-client.js";\nimport { leadCoreIngestInbound } from "../runtime/lead-core-bridge.js";\n',
  );
  mon = mon.replace(
    `if (!content?.trim()) return;

  // Record msgId→cliMsgId mapping for reaction/undo lookups`,
    `if (!content?.trim()) return;

  // Lead Core: ingest inbound (dedup + find-or-create conversation)
  void leadCoreIngestInbound({
    isGroup: Boolean(metadata?.isGroup),
    chatId: threadId,
    senderId: String(metadata?.fromId || metadata?.senderId || "unknown"),
    messageId: String(message.msgId || message.cliMsgId || \`\${threadId}-\${timestamp || Date.now()}\`),
    text: content,
  });

  // Record msgId→cliMsgId mapping for reaction/undo lookups`,
  );
  fs.writeFileSync(monPath, mon);
  console.log("✓ patched monitor.ts");
} else {
  console.log("· monitor.ts already bridged");
}

const build = spawnSync(
  "npx",
  [
    "esbuild",
    "index.ts",
    "--bundle",
    "--platform=node",
    "--format=esm",
    "--outfile=dist/index.js",
    "--external:openclaw",
    "--external:sharp",
    "--packages=external",
  ],
  { cwd: vendor, encoding: "utf8" },
);
if (build.status !== 0) {
  console.error(build.stderr || build.stdout);
  process.exit(build.status ?? 1);
}
console.log("✓ rebuilt vendor/zaloclaw/dist/index.js");
console.log("Restart gateways to load bridge. LEAD_CORE_ENFORCE=1 when token set (ohamarEnv).");
