#!/usr/bin/env node
/**
 * Rebuild cases/index.min.json from BA-*.yaml (no xlsx needed).
 * Token-tight: only id / sp / region / drive:FILE_ID
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const casesDir = join(root, "workspace/brand-kits/vicamed/cases");

function grab(yaml, key) {
  const m = yaml.match(new RegExp(`^\\s*${key}:\\s*(.+)$`, "m"));
  if (!m) return "";
  return m[1].trim().replace(/^["']|["']$/g, "");
}

const rows = [];
for (const name of readdirSync(casesDir).sort()) {
  if (!/^BA-.*\.yaml$/.test(name)) continue;
  const yaml = readFileSync(join(casesDir, name), "utf8");
  if (/usable:\s*false/.test(yaml)) continue;
  const id = grab(yaml, "case_id") || name.replace(/\.yaml$/, "");
  const sp = grab(yaml, "product_id");
  let v = grab(yaml, "region");
  if (v.length > 24 || v.startsWith("description")) {
    v = v.startsWith("description") ? "" : v.slice(0, 24);
  }
  const bid = grab(yaml, "before_id");
  const aid = grab(yaml, "after_id");
  const u = [];
  if (bid) u.push(`drive:${bid}`);
  if (aid) u.push(`drive:${aid}`);
  if (u.length === 0) continue;
  rows.push({ id, sp, v, u: u.slice(0, 3) });
}

const index = {
  v: 1,
  rule: 'send-images urls=u message="" | drive:ID via SA | only this file',
  n: rows.length,
  c: rows,
};

const out = join(casesDir, "index.min.json");
const body = JSON.stringify(index);
writeFileSync(out, body + "\n");
console.log(`Wrote ${out} (${Buffer.byteLength(body)} bytes, ${rows.length} cases)`);
for (const r of rows) console.log(`  ${r.id} ${r.sp} ${r.v} → ${r.u.length} files`);
