#!/usr/bin/env node
import { HOST, PORT, TOKEN } from "./config.mjs";

const r = await fetch(`http://${HOST}:${PORT}/v1/health`, {
  headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {},
});
const j = await r.json();
console.log(JSON.stringify(j, null, 2));
process.exit(r.ok ? 0 : 1);
