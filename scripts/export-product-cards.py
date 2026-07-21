#!/usr/bin/env python3
"""
Phase 6: Export approved product/price cards from Vicamed xlsx SoT.
Does NOT modify OpenClaw core — only writes workspace/brand-kits/.

Usage:
  python3 scripts/export-product-cards.py /path/to/Database_Chatbot.xlsx
  python3 scripts/export-product-cards.py /path/to.xlsx --brand vicamed --channel zalo
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, date, timedelta
from pathlib import Path

NS_MAIN = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
NS_REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"

ROOT = Path(__file__).resolve().parents[1]
KITS = ROOT / "workspace" / "brand-kits"


def col_row(ref: str):
    m = re.match(r"([A-Z]+)(\d+)", ref)
    return m.group(1), int(m.group(2))


def col_index(col: str) -> int:
    n = 0
    for ch in col:
        n = n * 26 + (ord(ch) - 64)
    return n


def load_ss(z: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in z.namelist():
        return []
    root = ET.fromstring(z.read("xl/sharedStrings.xml"))
    out = []
    for si in root.findall(f".//{NS_MAIN}si"):
        texts = si.findall(f".//{NS_MAIN}t")
        out.append("".join(t.text or "" for t in texts))
    return out


def sheet_map(z: zipfile.ZipFile):
    root = ET.fromstring(z.read("xl/workbook.xml"))
    sheets = []
    for sh in root.findall(f".//{NS_MAIN}sheets/{NS_MAIN}sheet"):
        sheets.append(
            (sh.attrib.get("name"), sh.attrib.get(f"{NS_REL}id"))
        )
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    rid = {rel.attrib.get("Id"): rel.attrib.get("Target") for rel in rels}
    return sheets, rid


def sheet_matrix(z: zipfile.ZipFile, path: str, ss: list[str], max_row: int = 5000):
    root = ET.fromstring(z.read(path))
    cells: dict[tuple[int, int], str] = {}
    max_r, max_c = 0, 0
    for c in root.findall(f".//{NS_MAIN}c"):
        ref = c.attrib.get("r")
        if not ref:
            continue
        col, row = col_row(ref)
        if row > max_row:
            continue
        ci = col_index(col)
        t = c.attrib.get("t")
        v = c.find(f"{NS_MAIN}v")
        is_el = c.find(f"{NS_MAIN}is")
        val = ""
        if t == "s" and v is not None and v.text:
            val = ss[int(v.text)]
        elif t == "inlineStr" and is_el is not None:
            val = "".join(
                x.text or ""
                for x in is_el.iter(f"{NS_MAIN}t")
            )
        elif v is not None:
            val = v.text or ""
        cells[(row, ci)] = val
        max_r = max(max_r, row)
        max_c = max(max_c, ci)
    grid = []
    for r in range(1, max_r + 1):
        row = []
        for c in range(1, max_c + 1):
            row.append(cells.get((r, c), ""))
        grid.append(row)
    return grid


def norm_header(h: str) -> str:
    h = (h or "").strip().lower()
    h = h.replace("\n", " ")
    # map Vietnamese / aliases → canonical
    aliases = {
        "mã sp": "product_id",
        "ma sp": "product_id",
        "product_id": "product_id",
        "tên sản phẩm": "name",
        "ten san pham": "name",
        "name": "name",
        "loại": "category",
        "loai": "category",
        "category": "category",
        "hãng/thương hiệu": "manufacturer",
        "hang/thuong hieu": "manufacturer",
        "thương hiệu": "manufacturer",
        "brand": "brand",
        "xuất xứ": "origin",
        "đơn vị tính": "unit",
        "don vi tinh": "unit",
        "unit": "unit",
        "mô tả ngắn (cho chatbot)": "short_desc",
        "mo ta ngan": "short_desc",
        "aliases": "aliases",
        "channel": "channel",
        "status": "status",
        "trạng thái": "status",
        "valid_from": "valid_from",
        "valid_until": "valid_until",
        "source_id": "source_id",
        "source_version": "source_version",
        "approved_at": "approved_at",
        "approved_by": "approved_by",
        "updated_at": "updated_at",
        "claim_id": "claim_id",
        "kind": "kind",
        "text": "text",
        "price": "price",
        "currency": "currency",
        "list_price": "list_price",
        "giá niêm yết (vnd)": "list_price",
        "giá bán (vnd)": "price",
        "price_note": "price_note",
        "giá bán tham khảo (pilot). báo giá t": "price_note",
    }
    if h in aliases:
        return aliases[h]
    # partial
    if "mã sp" in h or h == "mã sp":
        return "product_id"
    if h.startswith("giá bán"):
        return "price"
    if "niêm yết" in h:
        return "list_price"
    if "alias" in h:
        return "aliases"
    if "valid_from" in h or h == "hiệu lực từ":
        return "valid_from"
    if "valid_until" in h or "hiệu lực đến" in h:
        return "valid_until"
    if "source_version" in h:
        return "source_version"
    if "source_id" in h:
        return "source_id"
    if "claim" in h and "id" in h:
        return "claim_id"
    if h in ("kind", "loại claim"):
        return "kind"
    return re.sub(r"[^a-z0-9_]+", "_", h).strip("_")


def excel_date(v) -> str | None:
    if v is None or v == "":
        return None
    if isinstance(v, str) and re.match(r"\d{4}-\d{2}-\d{2}", v):
        return v[:10]
    try:
        n = float(v)
        # Excel serial
        if n > 20000:
            d = date(1899, 12, 30) + timedelta(days=int(n))
            return d.isoformat()
    except ValueError:
        pass
    s = str(v).strip()
    return s[:10] if s else None


def find_header_row(grid: list[list[str]]) -> int:
    """Return 0-based row index of headers."""
    best_i, best_score = 0, -1
    keys = {
        "product_id",
        "mã sp",
        "claim_id",
        "price",
        "status",
        "name",
        "tên sản phẩm",
    }
    for i, row in enumerate(grid[:5]):
        cells = [str(c).strip().lower() for c in row if str(c).strip()]
        score = sum(1 for c in cells if c in keys or any(k in c for k in keys))
        # header-like: many non-empty short-ish strings
        if len(cells) >= 4:
            score += 1
        if score > best_score:
            best_score = score
            best_i = i
    return best_i


def rows_as_dicts(grid: list[list[str]]) -> list[dict]:
    if not grid:
        return []
    hi = find_header_row(grid)
    headers = [norm_header(str(h)) for h in grid[hi]]
    # if first data looks like claim ids and headers wrong, try row0
    out = []
    for row in grid[hi + 1 :]:
        if not any(str(x).strip() for x in row):
            continue
        d = {}
        for i, h in enumerate(headers):
            if not h:
                continue
            val = row[i] if i < len(row) else ""
            d[h] = val.strip() if isinstance(val, str) else val
        # skip pure instruction rows
        pid = str(d.get("product_id", ""))
        if pid.startswith("Mã ") or "VD:" in pid or pid.startswith("Khớp"):
            continue
        if not any(str(v).strip() for v in d.values()):
            continue
        out.append(d)
    return out


def parse_xlsx(path: Path):
    z = zipfile.ZipFile(path)
    ss = load_ss(z)
    sheets, rid = sheet_map(z)
    by_name = {}
    for name, id_ in sheets:
        target = rid.get(id_, "").lstrip("/")
        if not target.startswith("xl/"):
            target = "xl/" + target
        grid = sheet_matrix(z, target, ss)
        by_name[name] = rows_as_dicts(grid)
    return by_name


def pick_sheet(by_name: dict, *patterns: str):
    for name, rows in by_name.items():
        for p in patterns:
            if re.search(p, name, re.I):
                return name, rows
    return None, []


def status_ok(s: str) -> bool:
    return str(s or "").strip().lower() == "approved"


def channel_ok(ch: str, want: str) -> bool:
    c = str(ch or "all").strip().lower()
    if not c or c == "all":
        return True
    return want.lower() in [x.strip() for x in c.split(",")]


def in_validity(row: dict, today: date) -> bool:
    vf = excel_date(row.get("valid_from"))
    vu = excel_date(row.get("valid_until"))
    if vf:
        try:
            if today < date.fromisoformat(vf):
                return False
        except ValueError:
            pass
    if vu:
        try:
            if today > date.fromisoformat(vu):
                return False
        except ValueError:
            pass
    return True


def parse_aliases(raw) -> list[str]:
    if not raw:
        return []
    parts = re.split(r"[,;|/]", str(raw))
    return [p.strip() for p in parts if p.strip()]


def parse_price(v) -> float | None:
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).replace("VNĐ", "").replace("VND", "").replace(",", "").replace(".", "")
    # if was 1.380.000 with dots as thousand sep already stripped wrong
    s = re.sub(r"[^\d.]", "", str(v).replace(",", ""))
    # Vietnamese: 1.380.000
    s2 = str(v).replace("VNĐ", "").replace("VND", "").strip()
    if re.match(r"^\d{1,3}(\.\d{3})+$", s2):
        s2 = s2.replace(".", "")
        try:
            return float(s2)
        except ValueError:
            return None
    try:
        return float(re.sub(r"[^\d.]", "", s2) or "nan")
    except ValueError:
        return None


def yaml_escape(s: str) -> str:
    s = str(s).replace('"', '\\"')
    if any(c in s for c in [":", "#", "{", "}", "[", "]", ",", "\n"]):
        return f'"{s}"'
    return s


def content_hash(obj: dict) -> str:
    blob = json.dumps(obj, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:16]


def write_atomic(path: Path, text: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)


def merge_products(prod_rows: list[dict], appr_rows: list[dict]) -> list[dict]:
    """Merge 01 products with 01_approval_tmp by product_id."""
    appr_by = {}
    for r in appr_rows:
        pid = str(r.get("product_id") or r.get("fil_hya_01") or "").strip()
        # approval tmp may have first column as id without header
        if not pid:
            # try first value
            vals = [str(v) for v in r.values() if str(v).startswith("FIL-")]
            pid = vals[0] if vals else ""
        if pid:
            appr_by[pid] = r

    # if approval rows look like headerless (keys are data)
    if not appr_by and appr_rows:
        for r in appr_rows:
            # keys might be wrong; values list
            vals = list(r.values())
            if vals and str(vals[0]).startswith("FIL-"):
                appr_by[str(vals[0])] = {
                    "product_id": vals[0],
                    "brand": vals[1] if len(vals) > 1 else "Vicamed",
                    "aliases": vals[2] if len(vals) > 2 else "",
                    "channel": vals[3] if len(vals) > 3 else "all",
                    "status": vals[4] if len(vals) > 4 else "draft",
                    "valid_from": vals[5] if len(vals) > 5 else "",
                    "valid_until": vals[6] if len(vals) > 6 else "",
                    "source_id": vals[7] if len(vals) > 7 else "",
                    "source_version": vals[8] if len(vals) > 8 else "",
                    "approved_at": vals[9] if len(vals) > 9 else "",
                    "approved_by": vals[10] if len(vals) > 10 else "",
                }

    out = []
    for r in prod_rows:
        pid = str(r.get("product_id") or "").strip()
        if not pid or not pid.startswith("FIL-") and not re.match(r"^[A-Z]{2,}", pid):
            # allow other ids
            if not pid or len(pid) < 3:
                continue
        m = dict(r)
        if pid in appr_by:
            a = appr_by[pid]
            for k in (
                "brand",
                "aliases",
                "channel",
                "status",
                "valid_from",
                "valid_until",
                "source_id",
                "source_version",
                "approved_at",
                "approved_by",
            ):
                if a.get(k) not in (None, ""):
                    m[k] = a[k]
        # defaults
        if not m.get("brand"):
            m["brand"] = "Vicamed"
        if not m.get("status"):
            m["status"] = "draft"
        if not m.get("channel"):
            m["channel"] = "all"
        out.append(m)
    return out


def fix_claims_if_headerless(rows: list[dict]) -> list[dict]:
    """If import lost headers, first values are ids."""
    if not rows:
        return rows
    sample = rows[0]
    if sample.get("claim_id") or sample.get("product_id"):
        return rows
    # keys might be first-row values wrongly used as headers from previous export
    fixed = []
    for r in rows:
        vals = list(r.values())
        if not vals:
            continue
        # detect CLM- pattern
        if str(vals[0]).startswith("CLM-") or str(vals[0]).startswith("FORBID"):
            fixed.append(
                {
                    "claim_id": vals[0],
                    "product_id": vals[1] if len(vals) > 1 else "",
                    "kind": vals[2] if len(vals) > 2 else "approved",
                    "text": vals[3] if len(vals) > 3 else "",
                    "channel": vals[4] if len(vals) > 4 else "all",
                    "status": vals[5] if len(vals) > 5 else "draft",
                    "valid_from": vals[6] if len(vals) > 6 else "",
                    "valid_until": vals[7] if len(vals) > 7 else "",
                    "source_id": vals[8] if len(vals) > 8 else "",
                    "source_version": vals[9] if len(vals) > 9 else "",
                    "approved_at": vals[10] if len(vals) > 10 else "",
                    "approved_by": vals[11] if len(vals) > 11 else "",
                }
            )
        elif "claim_id" in r or any(str(k).startswith("clm") for k in r.keys()):
            fixed.append(r)
    return fixed or rows


def fix_prices_if_headerless(rows: list[dict]) -> list[dict]:
    if not rows:
        return rows
    if rows[0].get("product_id") and ("price" in rows[0] or rows[0].get("price") is not None):
        # might still be wrong
        if str(rows[0].get("product_id", "")).startswith("FIL-"):
            return rows
    fixed = []
    for r in rows:
        vals = list(r.values())
        if vals and str(vals[0]).startswith("FIL-"):
            fixed.append(
                {
                    "product_id": vals[0],
                    "price": vals[1] if len(vals) > 1 else "",
                    "currency": vals[2] if len(vals) > 2 else "VND",
                    "list_price": vals[3] if len(vals) > 3 else "",
                    "price_note": vals[4] if len(vals) > 4 else "",
                    "unit": vals[5] if len(vals) > 5 else "",
                    "status": vals[6] if len(vals) > 6 else "draft",
                    "valid_from": vals[7] if len(vals) > 7 else "",
                    "valid_until": vals[8] if len(vals) > 8 else "",
                    "source_id": vals[9] if len(vals) > 9 else "",
                    "source_version": vals[10] if len(vals) > 10 else "",
                    "channel": vals[11] if len(vals) > 11 else "all",
                }
            )
    return fixed or rows


def export_product_yaml(p: dict, claims: list[dict], forbidden: list[str], now: str) -> str:
    pid = p["product_id"]
    aliases = parse_aliases(p.get("aliases"))
    if p.get("name") and p["name"] not in aliases:
        aliases = [p["name"].lower()] + aliases
    body = {
        "product": {
            "id": pid,
            "name": p.get("name") or pid,
            "brand": p.get("brand") or "Vicamed",
            "category": p.get("category") or "",
            "aliases": aliases,
        },
        "approval": {
            "status": str(p.get("status") or "draft").lower(),
            "source_id": str(p.get("source_id") or ""),
            "source_version": str(p.get("source_version") or ""),
            "approved_at": excel_date(p.get("approved_at")) or "",
            "valid_from": excel_date(p.get("valid_from")) or "",
            "valid_until": excel_date(p.get("valid_until")) or "",
            "channels": [c.strip() for c in str(p.get("channel") or "all").split(",")],
        },
        "sales": {
            "approved_claims": claims,
            "forbidden_claims": forbidden,
            "disclaimer_id": "medical_clinical_v1",
            "cta_id": "clinic_booking",
        },
    }
    h = content_hash(body)
    lines = [
        "schema_version: 1",
        "",
        "product:",
        f"  id: {pid}",
        f"  name: {yaml_escape(body['product']['name'])}",
        f"  brand: {yaml_escape(body['product']['brand'])}",
        f"  category: {yaml_escape(body['product']['category'])}",
        "  aliases:",
    ]
    for a in aliases:
        lines.append(f"    - {yaml_escape(a)}")
    lines += [
        "",
        "approval:",
        f"  status: {body['approval']['status']}",
        f"  source_id: {yaml_escape(body['approval']['source_id'])}",
        f"  source_version: {yaml_escape(str(body['approval']['source_version']))}",
        f"  approved_at: \"{body['approval']['approved_at']}\"",
        f"  valid_from: \"{body['approval']['valid_from']}\"",
        f"  valid_until: \"{body['approval']['valid_until']}\"",
        "  channels:",
    ]
    for ch in body["approval"]["channels"]:
        lines.append(f"    - {ch}")
    lines += ["", "sales:", "  approved_claims:"]
    for c in claims:
        lines.append(f"    - id: {c['id']}")
        lines.append(f"      text: {yaml_escape(c['text'])}")
    lines.append("  forbidden_claims:")
    for f in forbidden:
        lines.append(f"    - {yaml_escape(f)}")
    lines += [
        "  disclaimer_id: medical_clinical_v1",
        "  cta_id: clinic_booking",
        "",
        "sync:",
        f"  content_hash: \"{h}\"",
        f"  generated_at: \"{now}\"",
        f"  source_version: {yaml_escape(str(body['approval']['source_version']))}",
        "",
    ]
    return "\n".join(lines)


def export_price_yaml(pr: dict, now: str) -> str:
    pid = pr["product_id"]
    price = parse_price(pr.get("price"))
    list_p = parse_price(pr.get("list_price"))
    body = {
        "product_id": pid,
        "price": price,
        "list_price": list_p,
        "currency": pr.get("currency") or "VND",
        "status": str(pr.get("status") or "draft").lower(),
        "valid_from": excel_date(pr.get("valid_from")),
        "valid_until": excel_date(pr.get("valid_until")),
        "source_id": pr.get("source_id"),
        "source_version": str(pr.get("source_version") or ""),
    }
    h = content_hash(body)
    return "\n".join(
        [
            "schema_version: 1",
            f"product_id: {pid}",
            f"price: {int(price) if price is not None else 0}",
            f"currency: {body['currency']}",
            f"list_price: {int(list_p) if list_p is not None else ''}".rstrip(),
            f"price_note: {yaml_escape(pr.get('price_note') or '')}",
            f"unit: {yaml_escape(pr.get('unit') or '')}",
            f"status: {body['status']}",
            f"valid_from: \"{body['valid_from'] or ''}\"",
            f"valid_until: \"{body['valid_until'] or ''}\"",
            f"source_id: {yaml_escape(str(body['source_id'] or ''))}",
            f"source_version: {yaml_escape(body['source_version'])}",
            f"content_hash: \"{h}\"",
            f"generated_at: \"{now}\"",
            "",
        ]
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("xlsx")
    ap.add_argument("--brand", default="vicamed")
    ap.add_argument("--channel", default="zalo")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    path = Path(args.xlsx)
    if not path.exists():
        print("Not found:", path)
        return 2

    by_name = parse_xlsx(path)
    print("Tabs:", ", ".join(by_name.keys()))

    _, prod_rows = pick_sheet(by_name, r"01_.*sản phẩm", r"01_.*san pham", r"^01")
    # exclude approval tmp
    for name, rows in by_name.items():
        if re.search(r"01_.*sản phẩm", name, re.I) and "approval" not in name.lower():
            prod_rows = rows
            print(f"Products from: {name} ({len(rows)} rows)")
            break
    _, appr_rows = pick_sheet(by_name, r"approval")
    for name, rows in by_name.items():
        if "approval" in name.lower():
            appr_rows = rows
            print(f"Approval tmp from: {name} ({len(rows)} rows)")
            break
    _, claim_rows = pick_sheet(by_name, r"12_claim", r"claim")
    for name, rows in by_name.items():
        if re.search(r"12|claim", name, re.I):
            claim_rows = rows
            print(f"Claims from: {name} ({len(rows)} rows)")
            break
    _, price_rows = pick_sheet(by_name, r"13_price", r"price")
    for name, rows in by_name.items():
        if re.search(r"13|price", name, re.I) and "niêm" not in name.lower():
            price_rows = rows
            print(f"Prices from: {name} ({len(rows)} rows)")
            break

    claim_rows = fix_claims_if_headerless(claim_rows)
    price_rows = fix_prices_if_headerless(price_rows)
    products = merge_products(prod_rows, appr_rows)

    today = date.today()
    now = datetime.now().astimezone().isoformat(timespec="seconds")

    # index claims
    approved_by_pid: dict[str, list] = {}
    forbidden_global: list[str] = []
    forbidden_by_pid: dict[str, list[str]] = {}
    for c in claim_rows:
        kind = str(c.get("kind") or "").lower()
        st = str(c.get("status") or "").lower()
        if not status_ok(st):
            continue
        if not in_validity(c, today):
            continue
        if not channel_ok(c.get("channel"), args.channel):
            continue
        text = str(c.get("text") or "").strip()
        if not text:
            continue
        pid = str(c.get("product_id") or "").strip()
        if kind == "forbidden" or str(c.get("claim_id", "")).startswith("FORBID"):
            if pid in ("*", "", "all"):
                forbidden_global.append(text)
            else:
                forbidden_by_pid.setdefault(pid, []).append(text)
            continue
        if kind in ("approved", "approve", ""):
            if not pid or pid == "*":
                continue
            approved_by_pid.setdefault(pid, []).append(
                {
                    "id": str(c.get("claim_id") or f"CLM-{pid}"),
                    "text": text,
                }
            )

    # prices
    prices_by = {}
    for pr in price_rows:
        pid = str(pr.get("product_id") or "").strip()
        if not pid:
            continue
        if not status_ok(pr.get("status")):
            continue
        if not in_validity(pr, today):
            continue
        if not channel_ok(pr.get("channel"), args.channel):
            continue
        prices_by[pid] = pr

    out_prod = KITS / args.brand / "products"
    out_price = KITS / args.brand / "prices"
    written = []

    for p in products:
        pid = str(p.get("product_id") or "").strip()
        if not pid:
            continue
        if not status_ok(p.get("status")):
            print(f"SKIP product {pid}: status={p.get('status')}")
            continue
        if not in_validity(p, today):
            print(f"SKIP product {pid}: out of validity")
            continue
        if not channel_ok(p.get("channel"), args.channel):
            print(f"SKIP product {pid}: channel")
            continue
        claims = approved_by_pid.get(pid, [])
        if not claims:
            print(f"SKIP product {pid}: no approved claims (whitelist empty)")
            continue
        forbid = forbidden_global + forbidden_by_pid.get(pid, [])
        # dedupe forbid
        forbid = list(dict.fromkeys(forbid))
        yml = export_product_yaml(p, claims, forbid, now)
        dest = out_prod / f"{pid}.yaml"
        if not args.dry_run:
            write_atomic(dest, yml)
        written.append(str(dest.relative_to(ROOT)))
        print(f"WRITE product {pid} claims={len(claims)}")

        if pid in prices_by:
            py = export_price_yaml(prices_by[pid], now)
            pdest = out_price / f"{pid}.yaml"
            if not args.dry_run:
                write_atomic(pdest, py)
            written.append(str(pdest.relative_to(ROOT)))
            print(f"WRITE price {pid}")
        else:
            print(f"WARN no approved price for {pid}")

    print(f"\nDone. {len(written)} files. brand={args.brand}")
    for w in written:
        print(" ", w)
    return 0 if written else 1


if __name__ == "__main__":
    raise SystemExit(main())
