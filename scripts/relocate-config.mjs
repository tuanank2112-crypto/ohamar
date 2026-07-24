/**
 * Rewrite absolute paths in openclaw.json when the tree is moved
 * (e.g. Linux/WSL → Windows VPS). Safe to call every start.
 */
import fs from "node:fs";
import path from "node:path";
import {
  CONFIG_PATH,
  IS_WORKER,
  ROOT,
  STATE_DIR,
  WORKSPACE,
  ZALOCLAW,
  readJsonFile,
  stripBomFromJsonFile,
} from "./env.mjs";

const KNOWN_OLD_ROOTS = [
  "/home/lenkuy/ohamar",
  "C:\\home\\lenkuy\\ohamar",
  "C:/home/lenkuy/ohamar",
  "\\\\home\\lenkuy\\ohamar",
];

function toPosix(p) {
  return String(p).replace(/\\/g, "/");
}

function guessOldRootFromConfig(cfg) {
  const candidates = [];
  const load0 = cfg?.plugins?.load?.paths?.[0];
  if (typeof load0 === "string") {
    const n = toPosix(load0);
    const i = n.lastIndexOf("/vendor/zaloclaw");
    if (i > 0) candidates.push(n.slice(0, i));
  }
  const ws = cfg?.agents?.defaults?.workspace;
  if (typeof ws === "string") {
    const n = toPosix(ws);
    for (const suffix of ["/workspace-worker", "/workspace"]) {
      if (n.endsWith(suffix)) candidates.push(n.slice(0, -suffix.length));
    }
  }
  return candidates.filter(Boolean);
}

function rewriteString(s, oldRoots, rootNative, rootPosix) {
  if (typeof s !== "string" || !s) return s;
  let out = s;
  const outPosix = toPosix(out);

  for (const old of oldRoots) {
    if (!old) continue;
    const oldPosix = toPosix(old);
    const oldWin = oldPosix.replace(/\//g, "\\");
    if (out.includes(old)) out = out.split(old).join(rootNative);
    if (out.includes(oldPosix)) out = out.split(oldPosix).join(rootPosix);
    if (out.includes(oldWin)) out = out.split(oldWin).join(rootNative);
    // OpenClaw on Windows sometimes maps /home/... → C:\home\...
    const cHome = `C:${oldPosix.replace(/\//g, "\\")}`;
    if (out.includes(cHome)) out = out.split(cHome).join(rootNative);
    const cHomePosix = `C:${oldPosix}`;
    if (out.includes(cHomePosix)) out = out.split(cHomePosix).join(rootPosix);
  }

  // Broken claude CLI from Linux host — drop so gateway can start
  if (
    outPosix.includes("/.npm-global/bin/claude") ||
    outPosix.endsWith("/bin/claude")
  ) {
    if (!fs.existsSync(out)) return "claude"; // hope PATH; or leave disabled by caller
  }

  return out;
}

function walk(value, fix) {
  if (Array.isArray(value)) return value.map((v) => walk(v, fix));
  if (value && typeof value === "object") {
    const o = {};
    for (const [k, v] of Object.entries(value)) o[k] = walk(v, fix);
    return o;
  }
  if (typeof value === "string") return fix(value);
  return value;
}

/**
 * @returns {boolean} true if config was rewritten
 */
export function relocateOpenclawConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return false;

  let cfg;
  try {
    // Heal UTF-8 BOM before parse (common after Windows copy/edit)
    if (stripBomFromJsonFile(CONFIG_PATH)) {
      console.log(`✓ stripped UTF-8 BOM from ${CONFIG_PATH}`);
    }
    cfg = readJsonFile(CONFIG_PATH);
  } catch (e) {
    console.warn(`⚠️  Cannot parse ${CONFIG_PATH}: ${e.message}`);
    return false;
  }

  const rootNative = ROOT;
  const rootPosix = toPosix(ROOT);
  const oldRoots = [
    ...KNOWN_OLD_ROOTS,
    ...guessOldRootFromConfig(cfg),
  ].filter((r, i, a) => a.indexOf(r) === i && toPosix(r) !== rootPosix);

  const before = JSON.stringify(cfg);
  cfg = walk(cfg, (s) => rewriteString(s, oldRoots, rootNative, rootPosix));

  // Force critical portable fields for this instance
  if (cfg.agents?.defaults) {
    cfg.agents.defaults.workspace = WORKSPACE;
  }
  if (Array.isArray(cfg.agents?.list)) {
    for (const a of cfg.agents.list) {
      if (!a || typeof a !== "object") continue;
      if (IS_WORKER || a.id === "worker") {
        if (a.workspace) a.workspace = WORKSPACE;
        if (a.agentDir) {
          a.agentDir = path.join(STATE_DIR, "agents", "worker", "agent");
        }
      } else if (a.workspace && toPosix(a.workspace).includes("/workspace")) {
        a.workspace = WORKSPACE;
      }
    }
  }

  if (cfg.plugins?.load) {
    const paths = Array.isArray(cfg.plugins.load.paths)
      ? cfg.plugins.load.paths
      : [];
    const fixed = paths.map((p) => {
      if (typeof p !== "string") return p;
      if (toPosix(p).includes("zaloclaw") || !fs.existsSync(p)) return ZALOCLAW;
      return p;
    });
    if (!fixed.some((p) => toPosix(String(p)).endsWith("/vendor/zaloclaw"))) {
      fixed.push(ZALOCLAW);
    }
    cfg.plugins.load.paths = [...new Set(fixed.map((p) => path.resolve(String(p))))];
  }

  // cliBackends: remove missing command paths
  const cli = cfg.agents?.defaults?.cliBackends;
  if (cli && typeof cli === "object") {
    for (const [name, backend] of Object.entries(cli)) {
      if (backend?.command && !fs.existsSync(backend.command)) {
        // Keep key but use bare command name if on PATH, else delete
        if (name === "claude-cli") {
          delete cli[name];
        } else {
          backend.command = path.basename(backend.command);
        }
      }
    }
  }

  const after = JSON.stringify(cfg);
  if (before === after) {
    // Still verify zaloclaw exists
    const p0 = cfg.plugins?.load?.paths?.[0];
    if (p0 && !fs.existsSync(p0)) {
      console.error(`❌ Plugin path missing: ${p0}`);
      return false;
    }
    return false;
  }

  const bak = `${CONFIG_PATH}.bak.relocate.${Date.now()}`;
  fs.copyFileSync(CONFIG_PATH, bak);
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(cfg, null, 2)}\n`, "utf8");
  console.log(`✓ Relocated config paths → ${ROOT}`);
  console.log(`  backup: ${bak}`);
  return true;
}

// CLI: node scripts/relocate-config.mjs
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("relocate-config.mjs")) {
  relocateOpenclawConfig();
}
