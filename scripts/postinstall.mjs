#!/usr/bin/env node
/** Lightweight postinstall — ensure openclaw binary is present. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bin = path.join(root, "node_modules", "openclaw", "openclaw.mjs");
if (fs.existsSync(bin)) {
  console.log("✓ openclaw ready — next: npm run setup");
} else {
  console.warn("openclaw binary missing; check npm install");
}
