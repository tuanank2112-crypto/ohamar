#!/usr/bin/env python3
"""Phase 2 gap report for Vicamed product xlsx export."""
from __future__ import annotations

import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

NS_MAIN = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
NS_REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"


def col_row(ref: str):
    m = re.match(r"([A-Z]+)(\d+)", ref)
    return m.group(1), int(m.group(2))


def load_shared_strings(z: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in z.namelist():
        return []
    root = ET.fromstring(z.read("xl/sharedStrings.xml"))
    out = []
    for si in root.findall(f".//{NS_MAIN}si"):
        texts = si.findall(f".//{NS_MAIN}t")
        out.append("".join(t.text or "" for t in texts))
    return out


def sheet_list(z: zipfile.ZipFile):
    root = ET.fromstring(z.read("xl/workbook.xml"))
    sheets = []
    for sh in root.findall(f".//{NS_MAIN}sheets/{NS_MAIN}sheet"):
        sheets.append(
            (
                sh.attrib.get("name"),
                sh.attrib.get(f"{NS_REL}id"),
            )
        )
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    rid = {rel.attrib.get("Id"): rel.attrib.get("Target") for rel in rels}
    return sheets, rid


def headers_for(z: zipfile.ZipFile, path: str, ss: list[str]) -> list[str]:
    root = ET.fromstring(z.read(path))
    rows: dict[int, dict[str, str]] = {}
    for c in root.findall(f".//{NS_MAIN}c"):
        ref = c.attrib.get("r")
        if not ref:
            continue
        col, row = col_row(ref)
        if row > 3:
            continue
        t = c.attrib.get("t")
        v = c.find(f"{NS_MAIN}v")
        val = ""
        if t == "s" and v is not None and v.text:
            val = ss[int(v.text)]
        elif v is not None:
            val = v.text or ""
        rows.setdefault(row, {})[col] = val
    best: list[str] = []
    for r in sorted(rows):
        cols = rows[r]
        vals = [cols[k] for k in sorted(cols.keys(), key=lambda x: (len(x), x))]
        if any(v and len(str(v)) > 2 for v in vals):
            best = vals
            if r >= 2:
                break
    return best


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: python3 scripts/sheet-gap-report.py /path/to/export.xlsx")
        return 2
    path = Path(sys.argv[1])
    if not path.exists():
        print("File not found:", path)
        return 2

    z = zipfile.ZipFile(path)
    ss = load_shared_strings(z)
    sheets, rid = sheet_list(z)
    names = [n for n, _ in sheets]

    print("=== Tabs ===")
    for i, n in enumerate(names, 1):
        print(f"  {i}. {n}")

    has_claims = any(re.search(r"12|claim", n, re.I) for n in names)
    has_prices = any(
        re.search(r"13|price|giá", n, re.I) and "niêm" not in n.lower() for n in names
    )
    has_products = any(re.search(r"01|sản phẩm|product", n, re.I) for n in names)

    print("\n=== Phase 2 structure ===")
    print("OK  products tab" if has_products else "MISSING products-like tab (01)")
    print(
        "OK  claims tab (12)"
        if has_claims
        else "MISSING 12_Claims — import brand-kits/vicamed/sheet-templates/12_Claims.csv"
    )
    print(
        "OK  prices tab (13)"
        if has_prices
        else "MISSING 13_Prices — import brand-kits/vicamed/sheet-templates/13_Prices.csv"
    )

    product_req = [
        "status",
        "valid_from",
        "valid_until",
        "aliases",
        "channel",
        "brand",
        "source_version",
    ]
    print("\n=== Headers & gaps ===")
    for name, id_ in sheets:
        target = rid.get(id_, "").lstrip("/")
        if not target.startswith("xl/"):
            target = "xl/" + target
        try:
            h = headers_for(z, target, ss)
        except Exception as e:
            print(f"\n[{name}] ERR {e}")
            continue
        low = " | ".join(str(x).lower() for x in h)
        print(f"\n[{name}]")
        print("  headers:", " | ".join(str(x)[:36] for x in h[:12]))

        if re.search(r"sản phẩm|product|01", name, re.I):
            missing = [k for k in product_req if k not in low]
            if "product_id" not in low and "mã sp" not in low and "ma sp" not in low:
                missing.append("product_id|mã sp")
            if missing:
                print("  GAP product columns:", ", ".join(missing))
            else:
                print("  OK product approval columns present (by name match)")

        if re.search(r"liên hệ|contact|10", name, re.I):
            miss = [k for k in ("status", "verified") if k not in low]
            if miss:
                print("  GAP contact columns:", ", ".join(miss))

    print("\n=== Next actions ===")
    print("1. Follow brand-kits/PHASE-2-CHECKLIST.md on Google Sheets")
    print("2. Import CSVs from brand-kits/vicamed/sheet-templates/")
    print("3. Re-export xlsx and re-run this script until GAPs clear")
    print("4. Tell dev source_version=N → Phase 6 exporter")
    return 0 if has_claims and has_prices else 1


if __name__ == "__main__":
    raise SystemExit(main())
