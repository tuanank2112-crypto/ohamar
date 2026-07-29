/**
 * P8: CORS có kiểm soát cho Lead Core.
 *
 * Nguyên tắc:
 *  - Chỉ cho phép origin nằm trong allowlist, KHỚP CHÍNH XÁC (không wildcard).
 *  - KHÔNG bao giờ trả "*": API dùng Authorization (credentials) nên "*" vừa
 *    sai chuẩn vừa nguy hiểm.
 *  - Allowlist rỗng => KHÔNG bật CORS (mặc định an toàn: trình duyệt
 *    cross-origin bị chặn — vẫn gọi được từ server-to-server như cũ).
 */

/** Parse chuỗi "a, b, c" -> Set origin đã chuẩn hoá (bỏ dấu / cuối). */
export function parseAllowedOrigins(raw) {
    return new Set(
        String(raw || "")
            .split(",")
            .map((s) => s.trim().replace(/\/+$/, ""))
            .filter(Boolean),
    );
}

const ALLOW_METHODS = "GET, POST, OPTIONS";
const ALLOW_HEADERS = "Authorization, Content-Type";
const MAX_AGE = "600";

/**
 * Trả object header CORS nếu origin được phép, ngược lại null.
 *
 * @param {string|undefined} originHeader - giá trị header Origin của request
 * @param {Set<string>} allowed - allowlist đã parse
 */
export function corsHeadersFor(originHeader, allowed) {
    if (!originHeader || !allowed || allowed.size === 0) return null;
    const normalized = originHeader.trim().replace(/\/+$/, "");
    if (!allowed.has(normalized)) return null;
    return {
        // Echo lại đúng giá trị Origin trình duyệt gửi (trình duyệt đòi khớp chính xác).
        "Access-Control-Allow-Origin": originHeader,
        "Access-Control-Allow-Methods": ALLOW_METHODS,
        "Access-Control-Allow-Headers": ALLOW_HEADERS,
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": MAX_AGE,
        Vary: "Origin",
    };
}