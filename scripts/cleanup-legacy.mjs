#!/usr/bin/env node
/**
 * Archive leftover main-tree worker artifacts so instances stay fail-closed.
 * Does NOT delete — moves under data/_legacy_archive/<stamp>/
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const archiveRoot = path.join(ROOT, "data", "_legacy_archive", stamp);
fs.mkdirSync(archiveRoot, { recursive: true });

const moves = [
  {
    from: path.join(ROOT, "data", "agents", "worker"),
    to: path.join(archiveRoot, "agents-worker"),
    why: "worker agent runtime belongs in data-worker/",
  },
  {
    from: path.join(ROOT, "data", "credentials", "zaloclaw-credentials-worker.json"),
    to: path.join(archiveRoot, "zaloclaw-credentials-worker.json"),
    why: "worker Zalo session belongs in data-worker/credentials/",
  },
  {
    from: path.join(ROOT, "data", "credentials", "zaloclaw-worker-allowFrom.json"),
    to: path.join(archiveRoot, "zaloclaw-worker-allowFrom.json"),
    why: "worker allowFrom is configured in data-worker openclaw.json",
  },
  {
    from: path.join(
      ROOT,
      "data",
      "credentials",
      "zaloclaw-worker-allowFrom.json.bak.20260715T170030",
    ),
    to: path.join(archiveRoot, "zaloclaw-worker-allowFrom.json.bak"),
    why: "legacy backup",
  },
  {
    from: path.join(ROOT, "data-worker", "agents", "main"),
    to: path.join(archiveRoot, "data-worker-agents-main"),
    why: "main agent leftover under data-worker",
  },
];

let n = 0;
for (const m of moves) {
  if (!fs.existsSync(m.from)) {
    console.log(`· skip (missing): ${path.relative(ROOT, m.from)}`);
    continue;
  }
  fs.mkdirSync(path.dirname(m.to), { recursive: true });
  fs.renameSync(m.from, m.to);
  console.log(`✓ archived ${path.relative(ROOT, m.from)}`);
  console.log(`    → ${path.relative(ROOT, m.to)} (${m.why})`);
  n++;
}

// Strip disabled worker account * from main config if still present
const mainCfgPath = path.join(ROOT, "data", "openclaw.json");
if (fs.existsSync(mainCfgPath)) {
  const j = JSON.parse(fs.readFileSync(mainCfgPath, "utf8"));
  const acc = j.channels?.zaloclaw?.accounts?.worker;
  if (acc) {
    // Keep disabled stub clean — no wildcard
    acc.enabled = false;
    acc.allowFrom = [];
    acc.dmPolicy = "disabled";
    fs.writeFileSync(mainCfgPath, JSON.stringify(j, null, 2) + "\n");
    console.log("✓ cleaned main config accounts.worker (disabled, no allowFrom *)");
    n++;
  }
}

console.log(
  n
    ? `\n✓ Legacy cleanup done → ${path.relative(ROOT, archiveRoot)}`
    : "\n· Nothing to archive (already clean)",
);
