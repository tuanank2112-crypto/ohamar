#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { OPENCLAW_BIN, ROOT, assertOpenclawInstalled, ohamarEnv } from "./env.mjs";

assertOpenclawInstalled();
const r = spawnSync(process.execPath, [OPENCLAW_BIN, "doctor"], {
  cwd: ROOT,
  stdio: "inherit",
  env: ohamarEnv(),
});
process.exit(r.status ?? 0);
