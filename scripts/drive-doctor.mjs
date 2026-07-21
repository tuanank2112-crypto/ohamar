#!/usr/bin/env node
/**
 * Check Google Drive auth for send-images pipeline.
 *
 * Usage:
 *   npm run drive:doctor
 *   npm run drive:doctor -- drive:FILE_ID
 *   npm run drive:doctor -- 1CEJhRVMzmdqlzSZZ7xEdRDTmccxYkYYD
 */
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Load ohamar .env softly
function loadEnv() {
  const p = join(homedir(), "ohamar", "data", ".env");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k] && v) process.env[k] = v;
  }
}

loadEnv();

const arg = process.argv[2] || "";
const testId = arg.replace(/^g?drive:/i, "").trim();

console.log("=== Drive doctor (send-images pipeline) ===\n");

const cred = process.env.GOOGLE_APPLICATION_CREDENTIALS || "";
const apiKey =
  process.env.GOOGLE_API_KEY ||
  process.env.GOOGLE_DRIVE_API_KEY ||
  process.env.GEMINI_API_KEY ||
  "";

console.log("GOOGLE_APPLICATION_CREDENTIALS:", cred || "(not set)");
if (cred) {
  console.log("  file exists:", existsSync(cred));
  if (existsSync(cred)) {
    try {
      const j = JSON.parse(readFileSync(cred, "utf8"));
      console.log("  SA email (share folders to this):", j.client_email);
      console.log("  project_id:", j.project_id || "(n/a)");
    } catch (e) {
      console.log("  JSON parse error:", e.message);
    }
  }
} else {
  console.log("  → Create SA + set path. See workspace/brand-kits/DRIVE-API-SETUP.md");
}

console.log("API key present:", apiKey ? "yes (public files only)" : "no");

// Dynamic import drive helpers from zaloclaw dist
const driveModUrl = pathToFileURL(
  join(homedir(), "ohamar/vendor/zaloclaw/dist/index.js"),
).href;

let fetchDriveFileToTemp, extractDriveFileId, driveAuthStatus;
try {
  // dist may not export these — import via inline re-eval of drive-media is hard when bundled.
  // Call fetch using same logic via a small duplicate test if exports missing.
  const mod = await import(driveModUrl);
  fetchDriveFileToTemp = mod.fetchDriveFileToTemp;
  extractDriveFileId = mod.extractDriveFileId;
  driveAuthStatus = mod.driveAuthStatus;
} catch {
  /* bundled plugin may not export — use local fetch test below */
}

if (typeof driveAuthStatus === "function") {
  console.log("\nzaloclaw driveAuthStatus:", driveAuthStatus());
}

async function fetchWithSa(fileId) {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credPath || !existsSync(credPath)) {
    throw new Error("No GOOGLE_APPLICATION_CREDENTIALS");
  }
  const sa = JSON.parse(readFileSync(credPath, "utf8"));
  const crypto = await import("node:crypto");
  const b64url = (buf) =>
    Buffer.from(buf)
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/drive.readonly",
      aud: sa.token_uri || "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsigned = `${header}.${claim}`;
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(unsigned);
  sign.end();
  const jwt = `${unsigned}.${b64url(sign.sign(sa.private_key))}`;
  const tokenRes = await fetch(sa.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!tokenRes.ok) throw new Error(`token HTTP ${tokenRes.status} ${await tokenRes.text()}`);
  const { access_token } = await tokenRes.json();
  const mediaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    { headers: { Authorization: `Bearer ${access_token}` } },
  );
  if (!mediaRes.ok) throw new Error(`media HTTP ${mediaRes.status} ${await mediaRes.text()}`);
  const buf = Buffer.from(await mediaRes.arrayBuffer());
  return buf;
}

if (testId) {
  console.log("\nTest fetch fileId:", testId);
  try {
    let buf;
    if (typeof fetchDriveFileToTemp === "function") {
      const r = await fetchDriveFileToTemp(testId);
      if (!r) throw new Error("fetchDriveFileToTemp returned null (no credentials)");
      buf = readFileSync(r.path);
      try {
        unlinkSync(r.path);
      } catch {
        /* */
      }
      console.log("OK via zaloclaw helper:", r.method, r.bytes, "bytes");
    } else {
      buf = await fetchWithSa(testId);
      console.log("OK via SA direct:", buf.length, "bytes", "magic", buf.subarray(0, 3));
    }
    const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
    const isPng = buf[0] === 0x89 && buf[1] === 0x50;
    console.log("Looks like image:", isJpeg ? "jpeg" : isPng ? "png" : "unknown");
  } catch (e) {
    console.error("FAIL:", e.message);
    console.error("\nChecklist:");
    console.error("  1) Drive API enabled on GCP project");
    console.error("  2) JSON key path in GOOGLE_APPLICATION_CREDENTIALS");
    console.error("  3) Folder/file shared with SA client_email as Viewer");
    process.exit(1);
  }
} else {
  console.log("\nTip: npm run drive:doctor -- drive:FILE_ID");
  console.log("Example from index: drive:1CEJhRVMzmdqlzSZZ7xEdRDTmccxYkYYD (case cằm before)");
  if (!cred && !apiKey) {
    console.log("\nStatus: NOT READY — add Service Account (recommended).");
    process.exit(2);
  }
  if (cred && existsSync(cred)) {
    console.log("\nStatus: credentials file present — run with a file id to verify fetch.");
  }
}
