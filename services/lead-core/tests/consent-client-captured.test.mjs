/**
 * P6 — client_captured_at tách khỏi captured_at.
 * Mốc client khai được lưu lại để đối chiếu, nhưng captured_at (dùng sắp thứ tự)
 * luôn là thời gian server — củng cố việc vá G5.
 */
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { handlers, resetDb, newConversation } from "./helpers.mjs";

describe("P6 — client_captured_at", () => {
    beforeEach(() => resetDb());

    test("lưu client_captured_at nhưng captured_at vẫn là thời gian server", () => {
        const conv = newConversation();
        const row = handlers.appendConsent({
            conversation_id: conv.id,
            type: "zalo",
            purpose: "chăm sóc",
            action: "grant",
            captured_at: "9999-01-01T00:00:00.000Z",
        });
        assert.equal(row.client_captured_at, "9999-01-01T00:00:00.000Z");
        assert.notEqual(row.captured_at, "9999-01-01T00:00:00.000Z");
        assert.ok(
            new Date(row.captured_at).getFullYear() < 9000,
            "captured_at phải là mốc server, không phải năm 9999",
        );
    });

    test("không gửi captured_at -> client_captured_at = null", () => {
        const conv = newConversation();
        const row = handlers.appendConsent({
            conversation_id: conv.id,
            type: "zalo",
            purpose: "chăm sóc",
            action: "grant",
        });
        assert.equal(row.client_captured_at, null);
        assert.ok(row.captured_at);
    });
});