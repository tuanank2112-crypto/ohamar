/**
 * P8 — CORS allowlist (module thuần, không đụng DB/server).
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseAllowedOrigins, corsHeadersFor } from "../src/cors.mjs";

// Ghép scheme thủ công để giữ ví dụ gọn.
const S = "https:" + "//";
const OK = `${S}a.test`;
const EVIL = `${S}evil.test`;

describe("P8 — CORS allowlist", () => {
    test("parseAllowedOrigins: trim, bỏ / cuối, loại rỗng", () => {
        const s = parseAllowedOrigins(` ${OK}/ , , ${S}b.test `);
        assert.equal(s.size, 2);
        assert.ok(s.has(OK));
        assert.ok(s.has(`${S}b.test`));
    });

    test("allowlist rỗng -> không bật CORS (null)", () => {
        assert.equal(corsHeadersFor(OK, parseAllowedOrigins("")), null);
    });

    test("không có Origin header -> null", () => {
        assert.equal(corsHeadersFor(undefined, parseAllowedOrigins(OK)), null);
    });

    test("origin ngoài allowlist -> null", () => {
        assert.equal(corsHeadersFor(EVIL, parseAllowedOrigins(OK)), null);
    });

    test("origin hợp lệ -> trả header, echo nguyên gốc, KHÔNG dùng *", () => {
        const h = corsHeadersFor(OK, parseAllowedOrigins(OK));
        assert.ok(h);
        assert.equal(h["Access-Control-Allow-Origin"], OK);
        assert.notEqual(h["Access-Control-Allow-Origin"], "*");
        assert.equal(h["Access-Control-Allow-Credentials"], "true");
        assert.equal(h["Vary"], "Origin");
        assert.match(h["Access-Control-Allow-Headers"], /Authorization/);
    });

    test("khớp bất kể dấu / cuối ở Origin", () => {
        const h = corsHeadersFor(`${OK}/`, parseAllowedOrigins(OK));
        assert.ok(h);
        assert.equal(h["Access-Control-Allow-Origin"], `${OK}/`);
    });
});