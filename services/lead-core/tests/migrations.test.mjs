/**
 * P10 — migration framework: áp dụng đúng 1 lần, idempotent, chống sửa file cũ.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getDb } from "./helpers.mjs";
import { migrate } from "../src/db.mjs";

let tmpDir;
const prevEnv = process.env.LEAD_CORE_MIGRATIONS_DIR;

before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lc-mig-"));
    process.env.LEAD_CORE_MIGRATIONS_DIR = tmpDir;
});
after(() => {
    if (prevEnv === undefined) delete process.env.LEAD_CORE_MIGRATIONS_DIR;
    else process.env.LEAD_CORE_MIGRATIONS_DIR = prevEnv;
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { }
});

function tableExists(name) {
    return Boolean(
        getDb()
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
            .get(name),
    );
}
function migRow(version) {
    return getDb()
        .prepare("SELECT * FROM schema_migrations WHERE version = ?")
        .get(version);
}

describe("P10 — migration framework", () => {
    test("baseline luôn được ghi nhận", () => {
        migrate();
        assert.ok(migRow("000_baseline"), "phải có bản ghi 000_baseline");
    });

    test("migration mới được áp dụng đúng 1 lần", () => {
        fs.writeFileSync(
            path.join(tmpDir, "0001_widget.sql"),
            "CREATE TABLE IF NOT EXISTS mig_widget (id TEXT PRIMARY KEY, note TEXT);",
        );
        migrate();
        assert.equal(tableExists("mig_widget"), true);
        const row = migRow("0001_widget.sql");
        assert.ok(row, "phải có bản ghi cho 0001_widget.sql");
        const sum1 = row.checksum;

        // Chạy lại: idempotent, không đổi checksum, không ném lỗi
        migrate();
        assert.equal(migRow("0001_widget.sql").checksum, sum1);
    });

    test("sửa file migration đã áp dụng -> KHÔNG chạy lại, checksum giữ nguyên", () => {
        const before = migRow("0001_widget.sql").checksum;
        fs.writeFileSync(
            path.join(tmpDir, "0001_widget.sql"),
            "CREATE TABLE IF NOT EXISTS mig_widget (id TEXT PRIMARY KEY, note TEXT);\n-- đã sửa\nCREATE TABLE IF NOT EXISTS mig_should_not_exist (id TEXT);",
        );
        migrate();
        assert.equal(migRow("0001_widget.sql").checksum, before, "checksum phải giữ nguyên");
        assert.equal(tableExists("mig_should_not_exist"), false, "không được chạy phần sửa");
    });

    test("migration lỗi -> rollback, không ghi nhận version", () => {
        fs.writeFileSync(path.join(tmpDir, "0002_bad.sql"), "THIS IS NOT VALID SQL;");
        assert.throws(() => migrate(), /0002_bad\.sql/);
        assert.equal(migRow("0002_bad.sql"), undefined, "không được ghi nhận khi lỗi");
    });
});