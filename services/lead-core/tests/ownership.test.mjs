/**
 * Characterization tests — CHỐT LẠI hành vi HIỆN TẠI của Lead Core.
 *
 * Mục đích: tạo lưới an toàn TRƯỚC khi sửa lỗ hổng caller identity.
 * Toàn bộ file này PHẢI XANH với code hiện tại. Nếu sau khi sửa auth mà một
 * test ở đây vỡ, nghĩa là bạn đã đổi hành vi nghiệp vụ chứ không chỉ đổi lớp
 * auth — phải xem lại.
 */
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
    handlers,
    resetDb,
    getDb,
    newConversation,
    ownedConversation,
    idem,
    catchStatus,
} from "./helpers.mjs";

beforeEach(() => resetDb());

describe("ingestEvent", () => {
    test("tạo conversation mới với owner=none, status=NEW, version=1", () => {
        const conv = newConversation();
        assert.equal(conv.owner, "none");
        assert.equal(conv.status, "NEW");
        assert.equal(conv.version, 1);
        assert.equal(conv.channel, "zalo");
        assert.ok(conv.created_at);
    });

    test("thiếu trường bắt buộc -> 400", () => {
        assert.equal(catchStatus(() => handlers.ingestEvent({ channel: "zalo" })), 400);
        assert.equal(
            catchStatus(() =>
                handlers.ingestEvent({
                    channel: "zalo",
                    source_user_id: "u1",
                    thread_id: "t1",
                }),
            ),
            400,
            "thiếu source_message_id phải bị từ chối",
        );
    });

    test("dedup theo (channel, source_message_id)", () => {
        const payload = {
            channel: "zalo",
            source_user_id: "u-dup",
            thread_id: "t-dup",
            source_message_id: "m-dup",
            text: "hello",
        };
        const first = handlers.ingestEvent(payload);
        const second = handlers.ingestEvent(payload);

        assert.equal(first.duplicate, false);
        assert.equal(second.duplicate, true);
        assert.equal(second.conversation.id, first.conversation.id);

        const n = getDb().prepare("SELECT COUNT(*) AS n FROM conversations").get().n;
        assert.equal(n, 1);
    });

    test("tin nhắn mới cùng thread -> tái sử dụng conversation", () => {
        const base = { channel: "zalo", source_user_id: "u-same", thread_id: "t-same" };
        const a = handlers.ingestEvent({ ...base, source_message_id: "m1" });
        const b = handlers.ingestEvent({ ...base, source_message_id: "m2" });
        assert.equal(b.conversation.id, a.conversation.id);
        assert.equal(b.duplicate, false);
        assert.equal(b.reopened, false);
    });

    test("conversation đã CLOSED -> reopen thành BOT_ACTIVE", () => {
        const base = { channel: "zalo", source_user_id: "u-re", thread_id: "t-re" };
        const a = handlers.ingestEvent({ ...base, source_message_id: "m1" });
        handlers.closeConversation(a.conversation.id, { close_reason: "done" });

        const b = handlers.ingestEvent({ ...base, source_message_id: "m2" });
        assert.equal(b.reopened, true);
        assert.equal(b.conversation.status, "BOT_ACTIVE");
        assert.equal(b.conversation.close_reason, null);
    });
});

describe("claimOwnership", () => {
    test("nhận từ owner=none -> gán owner, status BOT_ACTIVE, version tăng", () => {
        const conv = newConversation();
        const next = handlers.claimOwnership(conv.id, { caller: "gia_huy" });
        assert.equal(next.owner, "gia_huy");
        assert.equal(next.status, "BOT_ACTIVE");
        assert.equal(next.version, conv.version + 1);
    });

    test("caller không hợp lệ -> 400", () => {
        const conv = newConversation();
        assert.equal(catchStatus(() => handlers.claimOwnership(conv.id, { caller: "none" })), 400);
        assert.equal(catchStatus(() => handlers.claimOwnership(conv.id, { caller: "hacker" })), 400);
        assert.equal(catchStatus(() => handlers.claimOwnership(conv.id, {})), 400);
    });

    test("conversation không tồn tại -> 404", () => {
        assert.equal(
            catchStatus(() => handlers.claimOwnership("không-có", { caller: "gia_huy" })),
            404,
        );
    });

    test("đã có chủ khác -> 409", () => {
        const conv = ownedConversation("gia_huy");
        assert.equal(
            catchStatus(() => handlers.claimOwnership(conv.id, { caller: "minh_phat" })),
            409,
        );
    });

    test("claim lại bởi chính chủ -> cho phép", () => {
        const conv = ownedConversation("gia_huy");
        const next = handlers.claimOwnership(conv.id, { caller: "gia_huy" });
        assert.equal(next.owner, "gia_huy");
        assert.equal(next.version, conv.version + 1);
    });

    test("version không khớp -> 409", () => {
        const conv = newConversation();
        assert.equal(
            catchStatus(() => handlers.claimOwnership(conv.id, { caller: "gia_huy", version: 999 })),
            409,
        );
    });

    test("status hợp lệ trong body được tôn trọng", () => {
        const conv = newConversation();
        const next = handlers.claimOwnership(conv.id, {
            caller: "human",
            status: "HUMAN_ACTIVE",
        });
        assert.equal(next.status, "HUMAN_ACTIVE");
    });
});

describe("authorizeOutbound", () => {
    test("caller đúng là owner -> allowed, sinh lease và outbound_log", () => {
        const conv = ownedConversation("gia_huy");
        const res = handlers.authorizeOutbound(conv.id, {
            caller: "gia_huy",
            idempotency_key: idem(),
            text: "xin chào",
        });
        assert.equal(res.allowed, true);
        assert.equal(res.duplicate, false);
        assert.ok(res.lease_id);
        assert.ok(res.expires_at);

        const lease = getDb()
            .prepare("SELECT * FROM send_leases WHERE conversation_id = ?")
            .get(conv.id);
        assert.equal(lease.caller, "gia_huy");

        const log = getDb()
            .prepare("SELECT * FROM outbound_log WHERE conversation_id = ?")
            .get(conv.id);
        assert.equal(log.status, "allowed");
    });

    test("caller không phải owner -> 409", () => {
        const conv = ownedConversation("gia_huy");
        assert.equal(
            catchStatus(() =>
                handlers.authorizeOutbound(conv.id, {
                    caller: "minh_phat",
                    idempotency_key: idem(),
                }),
            ),
            409,
        );
    });

    test("thiếu idempotency_key -> 400", () => {
        const conv = ownedConversation("gia_huy");
        assert.equal(
            catchStatus(() => handlers.authorizeOutbound(conv.id, { caller: "gia_huy" })),
            400,
        );
    });

    test("conversation CLOSED -> 409", () => {
        const conv = ownedConversation("gia_huy");
        handlers.closeConversation(conv.id, {});
        assert.equal(
            catchStatus(() =>
                handlers.authorizeOutbound(conv.id, {
                    caller: "gia_huy",
                    idempotency_key: idem(),
                }),
            ),
            409,
        );
    });

    test("version không khớp -> 409", () => {
        const conv = ownedConversation("gia_huy");
        assert.equal(
            catchStatus(() =>
                handlers.authorizeOutbound(conv.id, {
                    caller: "gia_huy",
                    version: 999,
                    idempotency_key: idem(),
                }),
            ),
            409,
        );
    });

    test("lặp lại cùng idempotency_key -> duplicate, không tạo thêm log", () => {
        const conv = ownedConversation("gia_huy");
        const key = idem();
        handlers.authorizeOutbound(conv.id, { caller: "gia_huy", idempotency_key: key });
        const again = handlers.authorizeOutbound(conv.id, {
            caller: "gia_huy",
            idempotency_key: key,
        });
        assert.equal(again.duplicate, true);
        assert.equal(again.allowed, true);

        const n = getDb().prepare("SELECT COUNT(*) AS n FROM outbound_log").get().n;
        assert.equal(n, 1);
    });
});

describe("consent", () => {
    test("grant rồi withdraw -> bản ghi mới nhất thắng", () => {
        const conv = newConversation();
        handlers.appendConsent({
            conversation_id: conv.id,
            type: "zalo",
            purpose: "chăm sóc",
            action: "grant",
            captured_at: "2026-01-01T00:00:00.000Z",
        });
        assert.equal(handlers.hasActiveConsent(conv.id, "zalo"), true);

        handlers.appendConsent({
            conversation_id: conv.id,
            type: "zalo",
            purpose: "chăm sóc",
            action: "withdraw",
            captured_at: "2026-02-01T00:00:00.000Z",
        });
        assert.equal(handlers.hasActiveConsent(conv.id, "zalo"), false);
    });

    test("consent là append-only, không ghi đè", () => {
        const conv = newConversation();
        for (const action of ["grant", "withdraw", "grant"]) {
            handlers.appendConsent({
                conversation_id: conv.id,
                type: "zalo",
                purpose: "chăm sóc",
                action,
            });
        }
        const n = getDb().prepare("SELECT COUNT(*) AS n FROM consents").get().n;
        assert.equal(n, 3);
    });

    test("action không hợp lệ -> 400", () => {
        const conv = newConversation();
        assert.equal(
            catchStatus(() =>
                handlers.appendConsent({
                    conversation_id: conv.id,
                    type: "zalo",
                    purpose: "x",
                    action: "maybe",
                }),
            ),
            400,
        );
    });

    test("conversation không tồn tại -> 404", () => {
        assert.equal(
            catchStatus(() =>
                handlers.appendConsent({
                    conversation_id: "không-có",
                    type: "zalo",
                    purpose: "x",
                    action: "grant",
                }),
            ),
            404,
        );
    });
});

describe("createHandoff", () => {
    test("handoff sang minh_phat KHÔNG có consent zalo -> 409", () => {
        const conv = ownedConversation("gia_huy");
        assert.equal(
            catchStatus(() =>
                handlers.createHandoff({
                    conversation_id: conv.id,
                    from_owner: "gia_huy",
                    to_owner: "minh_phat",
                    idempotency_key: idem(),
                }),
            ),
            409,
        );
    });

    test("có consent zalo -> handoff sang minh_phat thành công, status ASSIGNED", () => {
        const conv = ownedConversation("gia_huy");
        handlers.appendConsent({
            conversation_id: conv.id,
            type: "zalo",
            purpose: "chăm sóc",
            action: "grant",
        });
        const res = handlers.createHandoff({
            conversation_id: conv.id,
            from_owner: "gia_huy",
            to_owner: "minh_phat",
            idempotency_key: idem(),
        });
        assert.equal(res.duplicate, false);
        assert.equal(res.handoff.status, "accepted");
        assert.equal(res.conversation.owner, "minh_phat");
        assert.equal(res.conversation.status, "ASSIGNED");
    });

    test("handoff sang human -> status HUMAN_ACTIVE", () => {
        const conv = ownedConversation("gia_huy");
        const res = handlers.createHandoff({
            conversation_id: conv.id,
            from_owner: "gia_huy",
            to_owner: "human",
            idempotency_key: idem(),
        });
        assert.equal(res.conversation.owner, "human");
        assert.equal(res.conversation.status, "HUMAN_ACTIVE");
    });

    test("idempotency_key lặp lại -> duplicate, không tạo handoff mới", () => {
        const conv = ownedConversation("gia_huy");
        const key = idem();
        handlers.createHandoff({
            conversation_id: conv.id,
            from_owner: "gia_huy",
            to_owner: "human",
            idempotency_key: key,
        });
        const again = handlers.createHandoff({
            conversation_id: conv.id,
            from_owner: "human",
            to_owner: "human",
            idempotency_key: key,
        });
        assert.equal(again.duplicate, true);
        const n = getDb().prepare("SELECT COUNT(*) AS n FROM handoffs").get().n;
        assert.equal(n, 1);
    });

    test("thiếu trường bắt buộc -> 400", () => {
        assert.equal(catchStatus(() => handlers.createHandoff({ conversation_id: "x" })), 400);
    });
});

describe("closeConversation", () => {
    test("đặt CLOSED, owner về none, tăng version", () => {
        const conv = ownedConversation("gia_huy");
        const next = handlers.closeConversation(conv.id, { close_reason: "resolved" });
        assert.equal(next.status, "CLOSED");
        assert.equal(next.owner, "none");
        assert.equal(next.close_reason, "resolved");
        assert.equal(next.version, conv.version + 1);
    });

    test("conversation không tồn tại -> 404", () => {
        assert.equal(catchStatus(() => handlers.closeConversation("không-có", {})), 404);
    });
});

describe("metrics", () => {
    test("đếm tổng và nhóm theo status", () => {
        newConversation();
        ownedConversation("gia_huy");
        const m = handlers.metrics();
        assert.equal(m.total, 2);
        const byStatus = Object.fromEntries(m.byStatus.map((r) => [r.status, r.n]));
        assert.equal(byStatus.NEW, 1);
        assert.equal(byStatus.BOT_ACTIVE, 1);
        assert.equal(m.handoffFailed, 0);
    });
});

describe("watch snapshots", () => {
    test("lần đầu changed=true; cùng hash changed=false; đổi hash changed=true", () => {
        const url = "https://vicamed.vn/san-pham";
        assert.equal(handlers.upsertWatchSnapshot(url, "hash1", "a").changed, true);
        assert.equal(handlers.upsertWatchSnapshot(url, "hash1", "a").changed, false);
        const third = handlers.upsertWatchSnapshot(url, "hash2", "b");
        assert.equal(third.changed, true);
        assert.equal(third.previous_hash, "hash1");
        assert.equal(handlers.listWatchSnapshots().length, 1);
    });
});