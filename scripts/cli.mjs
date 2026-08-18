#!/usr/bin/env node
import { spawn } from "node:child_process";
import { assertOpenclawInstalled, OPENCLAW_BIN, ohamarEnv, ROOT } from "./env.mjs";

assertOpenclawInstalled();
const args = process.argv.slice(2);
const child = spawn(process.execPath, [OPENCLAW_BIN, ...args], {
  cwd: ROOT,
  stdio: "inherit",
  env: ohamarEnv(),
});
child.on("exit", (code) => process.exit(code ?? 0));
