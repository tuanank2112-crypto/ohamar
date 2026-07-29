/**
 * Security gap tests — mô tả hành vi MONG MUỐN sau khi vá lỗ hổng.
 *
 * Các lỗ hổng C1, G1-G9 đã được vá; tất cả test dưới đây hiện ĐANG CHẠY (không
 * còn { todo: true }) và phải PASS mà KHÔNG làm vỡ file ownership.test.mjs.
 *
 * Khi phát hiện lỗ hổng mới: thêm test mô tả hành vi mong muốn, sửa code cho
 * tới khi xanh, rồi giữ lại làm hồi quy (regression).
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

describe("C1 — caller identity phải lấy từ token, không từ body", () => {
    test("authorizeOutbound phải từ chối khi identity đã xác thực != body.caller", () => {
        const conv = ownedConversation("minh_phat");
        // Kẻ gọi đã xác thực là gia_huy nhưng khai caller=minh_phat trong body.
        // API mong muốn: tham số thứ 3 là identity từ tầng auth.
        const status = catchStatus(() =>
            handlers.authorizeOutbound(
                conv.id,
                { caller: "minh_phat", idempotency_key: idem() },
                { identity: "gia_huy" },
            ),
        );
        assert.equal(status, 403, "phải trả 403 khi body.caller không khớp identity");
    });

    test("claimOwnership phải từ chối khi identity != body.caller", () => {
        const conv = newConversation();
        const status = catchStatus(() =>
            handlers.claimOwnership(conv.id, { caller: "human" }, { identity: "minh_phat" }),
        );
        assert.equal(status, 403);
    });
});

describe("G1 — force claim leo thang đặc quyền", () => {
    test("khai caller=human + force=true chiếm được conversation của minh_phat", () => {
        const conv = ownedConversation("minh_phat");
        // HIỆN TẠI: thành công — chiếm quyền sở hữu chỉ bằng 2 field trong body.
        const status = catchStatus(() =>
            handlers.claimOwnership(conv.id, { caller: "human", force: true }),
        );
        assert.equal(status, 403, "force phải đòi identity đã xác thực, không phải body.caller");
    });
});

describe("G2 — createHandoff bỏ qua kiểm tra chủ sở hữu", () => {
    test("from_owner='gia_huy' vượt qua kiểm tra owner dù conversation thuộc người khác", () => {
        const conv = ownedConversation("minh_phat");
        // Điều kiện hiện tại:
        //   conv.owner !== fromOwner && fromOwner !== 'human' && fromOwner !== 'gia_huy'
        // => khai from_owner=gia_huy là bỏ qua được toàn bộ.
        const status = catchStatus(() =>
            handlers.createHandoff({
                conversation_id: conv.id,
                from_owner: "gia_huy",
                to_owner: "human",
                idempotency_key: idem(),
            }),
        );
        assert.equal(status, 409, "from_owner phải là chủ sở hữu thật");
    });
});

describe("G3 — to_owner không được validate", () => {
    test("to_owner ngoài danh sách OWNERS phải bị từ chối", () => {
        const conv = ownedConversation("gia_huy");
        const status = catchStatus(() =>
            handlers.createHandoff({
                conversation_id: conv.id,
                from_owner: "gia_huy",
                to_owner: "kẻ_tấn_công",
                idempotency_key: idem(),
            }),
        );
        assert.equal(status, 400, "to_owner phải thuộc OWNERS");
    });

    test("không được ghi owner rác vào DB (schema thiếu CHECK constraint)", () => {
        const conv = ownedConversation("gia_huy");
        try {
            handlers.createHandoff({
                conversation_id: conv.id,
                from_owner: "gia_huy",
                to_owner: "kẻ_tấn_công",
                idempotency_key: idem(),
            });
        } catch { }
        const row = handlers.getConversation(conv.id);
        assert.notEqual(row.owner, "kẻ_tấn_công");
    });
});

describe("G4 — cổng consent Zalo có thể bị tắt từ client", () => {
    test("require_zalo_consent=false vô hiệu hoá cổng consent", () => {
        const conv = ownedConversation("gia_huy");
        // Không hề có consent grant nào.
        const status = catchStatus(() =>
            handlers.createHandoff({
                conversation_id: conv.id,
                from_owner: "gia_huy",
                to_owner: "minh_phat",
                idempotency_key: idem(),
                require_zalo_consent: false,
            }),
        );
        assert.equal(status, 409, "client không được tự tắt cổng consent");
    });

    test("force=true vô hiệu hoá cổng consent", () => {
        const conv = ownedConversation("gia_huy");
        const status = catchStatus(() =>
            handlers.createHandoff({
                conversation_id: conv.id,
                from_owner: "gia_huy",
                to_owner: "minh_phat",
                idempotency_key: idem(),
                force: true,
            }),
        );
        assert.equal(status, 409, "force phải được ghi audit và giới hạn theo identity");
    });
});

describe("G5 — captured_at do client kiểm soát phá vỡ thứ tự consent", () => {
    test("grant đặt ngày tương lai khiến withdraw sau đó không bao giờ thắng", () => {
        const conv = newConversation();
        handlers.appendConsent({
            conversation_id: conv.id,
            type: "zalo",
            purpose: "chăm sóc",
            action: "grant",
            captured_at: "9999-01-01T00:00:00.000Z",
        });
        handlers.appendConsent({
            conversation_id: conv.id,
            type: "zalo",
            purpose: "chăm sóc",
            action: "withdraw",
        });
        assert.equal(
            handlers.hasActiveConsent(conv.id, "zalo"),
            false,
            "withdraw mới nhất theo thời gian server phải thắng",
        );
    });
});

describe("G6 — replay idempotency_key bởi caller khác", () => {
    test("caller khác dùng lại idempotency_key của người khác phải bị từ chối", () => {
        const conv = ownedConversation("gia_huy");
        const key = idem();
        handlers.authorizeOutbound(conv.id, { caller: "gia_huy", idempotency_key: key });
        // minh_phat không phải owner, nhưng nhánh duplicate trả về TRƯỚC khi kiểm tra owner.
        const res = handlers.authorizeOutbound(conv.id, {
            caller: "minh_phat",
            idempotency_key: key,
        });
        assert.equal(res.allowed, false, "nhánh duplicate phải kiểm tra caller khớp bản ghi gốc");
    });
});

describe("G7 — closeConversation không kiểm tra quyền", () => {
    test("đóng conversation phải đòi identity hợp lệ", () => {
        const conv = ownedConversation("minh_phat");
        const status = catchStatus(() =>
            handlers.closeConversation(conv.id, {}, { identity: "kẻ_lạ" }),
        );
        assert.equal(status, 403);
    });
});

describe("G8 — send_lease được ghi nhưng không bao giờ được kiểm tra", () => {
    test("cần một hàm validateLease để lease có ý nghĩa", () => {
        const conv = ownedConversation("gia_huy");
        handlers.authorizeOutbound(conv.id, { caller: "gia_huy", idempotency_key: idem() });
        getDb()
            .prepare("UPDATE send_leases SET expires_at = ? WHERE conversation_id = ?")
            .run("2000-01-01T00:00:00.000Z", conv.id);

        assert.equal(
            typeof handlers.validateLease,
            "function",
            "cần một hàm validateLease(conversationId, leaseId, caller)",
        );
    });
});

describe("G9 — ingestEvent không nguyên tố (atomic)", () => {
    test("nếu insert processed_messages thất bại, không được để lại conversation mồ côi", () => {
        const d = getDb();
        const before = d.prepare("SELECT COUNT(*) AS n FROM conversations").get().n;

        // Chiếm trước khoá dedup để buộc bước insert thứ hai thất bại.
        // (Mô phỏng race: 2 request cùng source_message_id vào đồng thời.)
        const conv = newConversation();
        d.prepare(
            `INSERT INTO processed_messages (channel, source_message_id, conversation_id, received_at)
       VALUES ('zalo', 'race-msg', ?, '2026-01-01T00:00:00.000Z')`,
        ).run(conv.id);

        let threw = false;
        try {
            handlers.ingestEvent({
                channel: "zalo",
                source_user_id: "u-race-mới",
                thread_id: "t-race-mới",
                source_message_id: "race-msg",
            });
        } catch {
            threw = true;
        }

        const after = d.prepare("SELECT COUNT(*) AS n FROM conversations").get().n;
        assert.equal(
            after,
            before + 1,
            `không được để lại conversation mồ côi khi dedup insert thất bại (threw=${threw})`,
        );
    });
});

describe("G8+ — lease phải được kiểm tra và tiêu thụ (single-use) khi gửi", () => {
    test("lease vừa tạo -> validateLease hợp lệ", () => {
        const conv = ownedConversation("gia_huy");
        const out = handlers.authorizeOutbound(conv.id, {
            caller: "gia_huy",
            idempotency_key: idem(),
        });
        const v = handlers.validateLease(conv.id, out.lease_id, "gia_huy");
        assert.equal(v.valid, true);
    });

    test("consumeLease đốt lease -> dùng lại bị từ chối (chống replay)", () => {
        const conv = ownedConversation("gia_huy");
        const out = handlers.authorizeOutbound(conv.id, {
            caller: "gia_huy",
            idempotency_key: idem(),
        });
        const first = handlers.consumeLease(conv.id, out.lease_id, "gia_huy");
        assert.equal(first.valid, true);
        assert.equal(first.consumed, true);
        const second = handlers.consumeLease(conv.id, out.lease_id, "gia_huy");
        assert.equal(second.valid, false);
        assert.equal(second.reason, "no_lease");
    });

    test("lease bị thay thế bởi lần authorize sau -> lease cũ superseded", () => {
        const conv = ownedConversation("gia_huy");
        const a = handlers.authorizeOutbound(conv.id, {
            caller: "gia_huy",
            idempotency_key: idem(),
        });
        handlers.authorizeOutbound(conv.id, {
            caller: "gia_huy",
            idempotency_key: idem(),
        });
        const v = handlers.validateLease(conv.id, a.lease_id, "gia_huy");
        assert.equal(v.valid, false);
        assert.equal(v.reason, "lease_superseded");
    });

    test("lease hết hạn -> expired, không cho tiêu thụ", () => {
        const conv = ownedConversation("gia_huy");
        const out = handlers.authorizeOutbound(conv.id, {
            caller: "gia_huy",
            idempotency_key: idem(),
        });
        getDb()
            .prepare("UPDATE send_leases SET expires_at = ? WHERE conversation_id = ?")
            .run("2000-01-01T00:00:00.000Z", conv.id);
        const v = handlers.consumeLease(conv.id, out.lease_id, "gia_huy");
        assert.equal(v.valid, false);
        assert.equal(v.reason, "lease_expired");
    });

    test("caller khác chủ lease -> bị từ chối", () => {
        const conv = ownedConversation("gia_huy");
        const out = handlers.authorizeOutbound(conv.id, {
            caller: "gia_huy",
            idempotency_key: idem(),
        });
        const v = handlers.validateLease(conv.id, out.lease_id, "minh_phat");
        assert.equal(v.valid, false);
        assert.equal(v.reason, "lease_belongs_to_other_caller");
    });
});