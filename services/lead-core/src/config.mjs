import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "..");

function loadEnvFile(p) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

loadEnvFile(path.join(ROOT, ".env"));
// optional shared secrets from ohamar main state
loadEnvFile(path.join(ROOT, "../../data/.env"));

export const HOST = process.env.LEAD_CORE_HOST || "127.0.0.1";
export const PORT = Number(process.env.LEAD_CORE_PORT || 18792);
export const DB_PATH = path.resolve(
  ROOT,
  process.env.LEAD_CORE_DB || "./data/lead.db",
);
export const LEASE_TTL_SEC = Number(process.env.LEAD_CORE_LEASE_TTL_SEC || 45);
export const RETENTION_DAYS = Number(process.env.LEAD_CORE_RETENTION_DAYS || 365);
export const MAX_BODY = Number(process.env.LEAD_CORE_MAX_BODY || 262144);

export const OWNERS = new Set([
  "none",
  "gia_huy",
  "minh_phat",
  "fb_page",
  "human",
]);

/**
 * Danh tính có thể XÁC THỰC được. Khác OWNERS ở chỗ không có "none":
 * "none" là trạng thái sở hữu, không phải một chủ thể gọi API.
 */
export const IDENTITIES = new Set(["gia_huy", "minh_phat", "fb_page", "human"]);

export const STATUSES = new Set([
  "NEW",
  "BOT_ACTIVE",
  "WAITING_CONSENT",
  "ASSIGNED",
  "HUMAN_ACTIVE",
  "CLOSED",
]);

/**
 * P3: status mà claimOwnership ĐƯỢC PHÉP đặt trực tiếp từ body.
 * KHÔNG gồm NEW/CLOSED: chuyển sang CLOSED phải đi qua closeConversation
 * (audit + reset owner); NEW là trạng thái khởi tạo, không claim ngược về.
 */
export const CLAIMABLE_STATUSES = new Set([
  "BOT_ACTIVE",
  "WAITING_CONSENT",
  "ASSIGNED",
  "HUMAN_ACTIVE",
]);

const MIN_TOKEN_LEN = 16;

/**
 * LEAD_CORE_TOKENS="gia_huy:tokenA,minh_phat:tokenB,human:tokenC"
 * Trả về Map<token, identity>. Bỏ qua entry sai định dạng / token quá ngắn.
 */
function parseTokens(raw) {
  const map = new Map();
  const problems = [];
  for (const part of String(raw || "").split(",")) {
    const t = part.trim();
    if (!t) continue;
    const i = t.indexOf(":");
    if (i < 1) {
      problems.push(`thiếu dấu ":" trong "${t.slice(0, 12)}..."`);
      continue;
    }
    const id = t.slice(0, i).trim();
    const tok = t.slice(i + 1).trim();
    if (!IDENTITIES.has(id)) {
      problems.push(`identity không hợp lệ: ${id}`);
      continue;
    }
    if (tok.length < MIN_TOKEN_LEN) {
      problems.push(`token của ${id} ngắn hơn ${MIN_TOKEN_LEN} ký tự`);
      continue;
    }
    if (map.has(tok)) {
      problems.push(`token trùng nhau giữa ${map.get(tok)} và ${id}`);
      continue;
    }
    map.set(tok, id);
  }
  return { map, problems };
}

const parsed = parseTokens(process.env.LEAD_CORE_TOKENS);
export const TOKENS = parsed.map;
export const TOKEN_PROBLEMS = parsed.problems;

/**
 * Token dùng chung cũ. Vẫn hoạt động để không làm sập hệ thống đang chạy,
 * nhưng nay bị RÀNG BUỘC vào đúng MỘT identity thay vì cho phép khai bất kỳ.
 */
export const LEGACY_TOKEN = process.env.LEAD_CORE_TOKEN || "";
export const LEGACY_IDENTITY = IDENTITIES.has(
  process.env.LEAD_CORE_TOKEN_IDENTITY || "",
)
  ? process.env.LEAD_CORE_TOKEN_IDENTITY
  : "gia_huy";

// Giữ lại tên cũ cho các module khác đang import { TOKEN }.
export const TOKEN = LEGACY_TOKEN;

/**
 * P2: client/gate/cron cần lấy ĐÚNG token theo identity để danh tính xác thực
 * ở server khớp với caller. Nguồn sự thật là LEAD_CORE_TOKENS; nếu không có
 * entry cho identity thì lùi về LEGACY_TOKEN.
 */
export const TOKENS_BY_IDENTITY = new Map(
  [...TOKENS].map(([tok, id]) => [id, tok]),
);

export function tokenForCaller(caller) {
  if (caller && TOKENS_BY_IDENTITY.has(caller)) {
    return TOKENS_BY_IDENTITY.get(caller);
  }
  return LEGACY_TOKEN;
}