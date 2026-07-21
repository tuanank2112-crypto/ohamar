#!/usr/bin/env node
/**
 * Vicamed website watcher — content hash diff, store in Lead Core.
 * Usage:
 *   LEAD_CORE_TOKEN=... node src/watch.mjs
 *   node src/watch.mjs --json
 */
import crypto from "node:crypto";
import { HOST, PORT, TOKEN } from "./config.mjs";

const SOURCES = [
  "https://www.vicamed.vn/",
  "https://www.vicamed.vn/pages/lien-he",
  "https://www.vicamed.vn/blogs/news",
];

const asJson = process.argv.includes("--json");

function stripNoise(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000);
}

async function fetchText(url) {
  const r = await fetch(url, {
    headers: {
      "User-Agent": "OhamarVicamedWatch/0.1 (+local; brand monitor)",
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.text();
}

async function postSnapshot(sourceUrl, contentHash, excerpt) {
  const r = await fetch(`http://${HOST}:${PORT}/v1/watch/snapshots`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source_url: sourceUrl,
      content_hash: contentHash,
      excerpt,
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || `snapshot failed ${r.status}`);
  return j;
}

const results = [];
for (const url of SOURCES) {
  try {
    const html = await fetchText(url);
    const text = stripNoise(html);
    const hash = crypto.createHash("sha256").update(text).digest("hex");
    const excerpt = text.slice(0, 400);
    const snap = await postSnapshot(url, hash, excerpt);
    results.push({
      url,
      ok: true,
      changed: snap.changed,
      hash: hash.slice(0, 12),
      previous: snap.previous_hash?.slice(0, 12) ?? null,
    });
  } catch (e) {
    results.push({ url, ok: false, error: e.message });
  }
}

const changed = results.filter((r) => r.ok && r.changed);
const report = {
  ts: new Date().toISOString(),
  changed_count: changed.length,
  results,
  announce: changed.length > 0,
  message:
    changed.length === 0
      ? null
      : `[Vicamed watch] ${changed.length} URL(s) changed:\n` +
        changed.map((c) => `• ${c.url} (${c.hash})`).join("\n"),
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Vicamed watch — changed=${report.changed_count}`);
  for (const r of results) {
    if (!r.ok) console.log(`  ✗ ${r.url}: ${r.error}`);
    else
      console.log(
        `  ${r.changed ? "Δ" : "="} ${r.url} hash=${r.hash}`,
      );
  }
  if (report.message) console.log("\n" + report.message);
}

process.exit(results.some((r) => !r.ok) ? 1 : 0);
