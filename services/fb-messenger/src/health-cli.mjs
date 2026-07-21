#!/usr/bin/env node
import { HOST, PORT } from "./config.mjs";
const r = await fetch(`http://${HOST}:${PORT}/health`);
console.log(await r.text());
process.exit(r.ok ? 0 : 1);
