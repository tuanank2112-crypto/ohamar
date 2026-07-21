#!/usr/bin/env node
/**
 * Copy integration skills into ohamar workspaces (local, often gitignored).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const srcSkills = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "ohamar-integration/skills",
);

const targets = [
  path.join(root, "workspace/skills"),
  path.join(root, "workspace-worker/skills"),
];

for (const destRoot of targets) {
  fs.mkdirSync(destRoot, { recursive: true });
  for (const name of fs.readdirSync(srcSkills)) {
    const from = path.join(srcSkills, name);
    if (!fs.statSync(from).isDirectory()) continue;
    const to = path.join(destRoot, name);
    fs.cpSync(from, to, { recursive: true });
    console.log("✓", path.relative(root, to));
  }
}

// optional BEHAVIOR snippet
const snip = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "ohamar-integration/BEHAVIOR-LEAD-CORE.md",
);
for (const ws of ["workspace", "workspace-worker"]) {
  const dest = path.join(root, ws, "BEHAVIOR-LEAD-CORE.md");
  if (fs.existsSync(path.dirname(dest))) {
    fs.copyFileSync(snip, dest);
    console.log("✓", path.relative(root, dest), "(include from BEHAVIOR.md if desired)");
  }
}

console.log("\nDone. Restart gateways if agents were running.");
