#!/usr/bin/env node
/**
 * Lead Core + multi-channel doctor
 */
import fs from "node:fs";
import path from "node:path";
import { HOST, PORT, TOKEN, DB_PATH, ROOT } from "./config.mjs";

const checks = [];

function ok(name, detail) {
  checks.push({ name, ok: true, detail });
  console.log(`✓ ${name}${detail ? " — " + detail : ""}`);
}
function bad(name, detail) {
  checks.push({ name, ok: false, detail });
  console.log(`✗ ${name}${detail ? " — " + detail : ""}`);
}

// env
if (TOKEN && TOKEN.length >= 16) ok("LEAD_CORE_TOKEN", `len=${TOKEN.length}`);
else bad("LEAD_CORE_TOKEN", "missing or short");

// db
if (fs.existsSync(DB_PATH)) {
  const st = fs.statSync(DB_PATH);
  ok("database", `${DB_PATH} (${st.size} bytes)`);
} else bad("database", `missing ${DB_PATH} — run migrate`);

// http
try {
  const r = await fetch(`http://${HOST}:${PORT}/v1/health`);
  const j = await r.json();
  if (j.ok) ok("http health", `${HOST}:${PORT}`);
  else bad("http health", JSON.stringify(j));
} catch (e) {
  bad("http health", e.message + " — npm run lead-core:start");
}

// metrics if up
if (TOKEN) {
  try {
    const r = await fetch(`http://${HOST}:${PORT}/v1/metrics`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (r.ok) {
      const m = await r.json();
      ok("metrics", `conversations=${m.total}`);
    }
  } catch {
    /* ignore */
  }
}

// bridge patch present?
const bridge = path.join(
  ROOT,
  "../../vendor/zaloclaw/src/runtime/lead-core-bridge.ts",
);
if (fs.existsSync(path.resolve(ROOT, bridge))) {
  ok("zaloclaw bridge file", "present");
} else {
  bad("zaloclaw bridge", "run npm run lead-core:apply-bridge");
}

// fb scaffold
const fb = path.join(ROOT, "../fb-messenger");
if (fs.existsSync(path.join(fb, "src/server.mjs"))) {
  ok("fb-messenger scaffold", "services/fb-messenger");
}

// watch
const watch = path.join(ROOT, "src/watch.mjs");
if (fs.existsSync(watch)) ok("vicamed watch script", "src/watch.mjs");

const failed = checks.filter((c) => !c.ok).length;
console.log(failed ? `\n${failed} issue(s)` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
