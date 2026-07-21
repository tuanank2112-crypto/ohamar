#!/usr/bin/env python3
"""
Option B — Expand tab 09 folder links → file lists for bot case cards.

Keeps Google Drive **folders** as SoT in the sheet. This script:
  1. Reads xlsx tab `09_Các ca lâm sàng` (or name match)
  2. Extracts folder IDs from "Link ảnh trước/sau"
  3. Lists public folder children via Drive folder page (`_DRIVE_ivd`)
     Optional: Drive API v3 if GOOGLE_API_KEY / GEMINI_API_KEY in env
  4. Writes:
       workspace/brand-kits/<brand>/cases/<case_id>.yaml
       workspace/brand-kits/<brand>/sheet-cache/09_cases.json

Usage:
  python3 scripts/expand-clinical-case-folders.py /path/to/Database_Chatbot.xlsx
  python3 scripts/expand-clinical-case-folders.py /path/to.xlsx --brand vicamed
  npm run cards:cases -- /path/to.xlsx

Notes:
  - Folders/files must be link-visible (Anyone with the link / public) for anonymous expand.
  - Send policy: **on-demand only** (khách hỏi / cần xem case) — không dump proactively.
  - Không chờ boss bật approved từng case; sheet SoT đã là case được phép dùng.
  - Vẫn: không gửi case nếu khách không hỏi; max ảnh / reply; không tên khách.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

NS_MAIN = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
NS_REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"

ROOT = Path(__file__).resolve().parents[1]
KITS = ROOT / "workspace" / "brand-kits"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

# ── xlsx helpers (same spirit as export-product-cards.py) ───────────────────


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
        sheets.append((sh.attrib.get("name"), sh.attrib.get(f"{NS_REL}id")))
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    rid = {rel.attrib.get("Id"): rel.attrib.get("Target") for rel in rels}
    return sheets, rid


def sheet_matrix(z: zipfile.ZipFile, path: str, ss: list[str], max_row: int = 500):
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
            val = "".join(x.text or "" for x in is_el.iter(f"{NS_MAIN}t"))
        elif v is not None:
            val = v.text or ""
        cells[(row, ci)] = val
        max_r = max(max_r, row)
        max_c = max(max_c, ci)
    grid = []
    for r in range(1, max_r + 1):
        row = [cells.get((r, c), "") for c in range(1, max_c + 1)]
        grid.append(row)
    return grid


def norm_header(h: str) -> str:
    h = (h or "").strip().lower().replace("\n", " ")
    aliases = {
        "id": "case_id",
        "case_id": "case_id",
        "mã sp sử dụng": "product_id",
        "ma sp su dung": "product_id",
        "mã sp": "product_id",
        "product_id": "product_id",
        "mô tả case (chatbot mô tả)": "description",
        "mo ta case": "description",
        "mô tả case": "description",
        "description": "description",
        "vùng điều trị": "region",
        "vung dieu tri": "region",
        "region": "region",
        "link ảnh trước": "folder_before",
        "link anh truoc": "folder_before",
        "folder_before": "folder_before",
        "link ảnh sau": "folder_after",
        "link anh sau": "folder_after",
        "folder_after": "folder_after",
        "thời gian sau điều trị": "followup",
        "bác sĩ thực hiện và cơ sở thực hiện": "doctor",
        "bac si": "doctor",
        "ngày thực hiện": "date_raw",
        "ghi chú": "notes",
        "consent": "consent",
        "status": "status",
    }
    if h in aliases:
        return aliases[h]
    for k, v in aliases.items():
        if k in h:
            return v
    return re.sub(r"[^a-z0-9_]+", "_", h).strip("_") or "col"


def rows_as_dicts(grid: list[list[str]]) -> list[dict]:
    if not grid:
        return []
    # find header row containing "link" or "mã sp"
    hi = 0
    for i, row in enumerate(grid[:8]):
        joined = " ".join(str(c).lower() for c in row)
        if "link" in joined and ("ảnh" in joined or "anh" in joined or "sp" in joined):
            hi = i
            break
        if "mã sp" in joined or "product" in joined:
            hi = i
    headers = [norm_header(str(h)) for h in grid[hi]]
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
        # skip instruction rows
        blob = " ".join(str(v) for v in d.values())
        if "CHỈ DÙNG CASE" in blob or "BA-001" in blob and "Drive" in blob:
            continue
        if "⚠️" in blob:
            continue
        out.append(d)
    return out


def parse_xlsx_tab09(path: Path) -> tuple[str, list[dict]]:
    z = zipfile.ZipFile(path)
    ss = load_ss(z)
    sheets, rid = sheet_map(z)
    chosen = None
    for name, id_ in sheets:
        if re.search(r"09|l[aâ]m\s*s[aà]ng|clinical|case", name or "", re.I):
            chosen = (name, id_)
            break
    if not chosen:
        raise SystemExit("Tab 09 (lâm sàng / cases) not found in workbook")
    name, id_ = chosen
    target = rid.get(id_, "").lstrip("/")
    if not target.startswith("xl/"):
        target = "xl/" + target
    grid = sheet_matrix(z, target, ss)
    return name, rows_as_dicts(grid)


# ── Drive folder expand ─────────────────────────────────────────────────────


def extract_drive_id(url_or_id: str) -> str | None:
    s = (url_or_id or "").strip()
    if not s:
        return None
    if re.fullmatch(r"[a-zA-Z0-9_-]{10,}", s):
        return s
    for pat in [
        r"/folders/([a-zA-Z0-9_-]+)",
        r"/file/d/([a-zA-Z0-9_-]+)",
        r"[?&]id=([a-zA-Z0-9_-]+)",
        r"open\?id=([a-zA-Z0-9_-]+)",
    ]:
        m = re.search(pat, s)
        if m:
            return m.group(1)
    return None


def http_get(url: str, timeout: int = 30) -> tuple[int, str, str]:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8", "replace")
            return resp.getcode(), body, resp.geturl()
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace") if e.fp else ""
        return e.code, body, url


def decode_drive_ivd(html: str) -> str | None:
    m = re.search(r"_DRIVE_ivd'\]\s*=\s*'((?:\\x[0-9a-fA-F]{2}|[^'])*)'", html)
    if not m:
        m = re.search(r'_DRIVE_ivd"\]\s*=\s*"((?:\\x[0-9a-fA-F]{2}|[^"])*)"', html)
    if not m:
        return None
    raw = m.group(1)
    return re.sub(r"\\x([0-9a-fA-F]{2})", lambda mm: chr(int(mm.group(1), 16)), raw)


def list_folder_via_html(folder_id: str) -> list[dict]:
    """Anonymous list of public folder children via Drive web page."""
    code, html, final = http_get(f"https://drive.google.com/drive/folders/{folder_id}")
    if code != 200:
        return []
    if "you need access" in html.lower() or "request access" in html.lower():
        return []
    ivd = decode_drive_ivd(html)
    if not ivd:
        return []
    # ["FILEID",["PARENT"],"name","mime/type"  — mime may be image\/jpeg
    pat = re.compile(
        r'\["([a-zA-Z0-9_-]{10,})",\["([a-zA-Z0-9_-]{10,})"\],"(.*?)",'
        r'"((?:image|video|application)\\?/[^"]+)"'
    )
    files = []
    for mid, parent, name, mime in pat.findall(ivd):
        if mid == folder_id:
            continue
        name = name.replace("\\/", "/")
        mime = mime.replace("\\/", "/")
        files.append(
            {
                "id": mid,
                "name": name,
                "mimeType": mime,
                "parent": parent,
                "source": "html_ivd",
            }
        )
    # dedupe preserve order
    seen = set()
    out = []
    for f in files:
        if f["id"] in seen:
            continue
        seen.add(f["id"])
        out.append(f)
    return out


def list_folder_via_api(folder_id: str, api_key: str) -> list[dict]:
    q = f"'{folder_id}' in parents and trashed=false"
    params = urllib.parse.urlencode(
        {
            "q": q,
            "fields": "files(id,name,mimeType,shortcutDetails)",
            "pageSize": "100",
            "key": api_key,
            "supportsAllDrives": "true",
            "includeItemsFromAllDrives": "true",
        }
    )
    url = f"https://www.googleapis.com/drive/v3/files?{params}"
    code, body, _ = http_get(url)
    if code != 200:
        return []
    try:
        data = json.loads(body)
    except json.JSONDecodeError:
        return []
    out = []
    for f in data.get("files") or []:
        out.append(
            {
                "id": f.get("id"),
                "name": f.get("name"),
                "mimeType": f.get("mimeType"),
                "parent": folder_id,
                "source": "drive_api",
            }
        )
    return out


def load_api_key() -> str | None:
    for k in ("GOOGLE_API_KEY", "GEMINI_API_KEY", "GOOGLE_DRIVE_API_KEY"):
        v = os.environ.get(k, "").strip()
        if v:
            return v
    # optional .env under data/
    env_path = ROOT / "data" / ".env"
    if env_path.is_file():
        for line in env_path.read_text(encoding="utf-8", errors="replace").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            k, v = k.strip(), v.strip().strip('"').strip("'")
            if k in ("GOOGLE_API_KEY", "GEMINI_API_KEY", "GOOGLE_DRIVE_API_KEY") and v:
                return v
    return None


def list_folder(folder_id: str, api_key: str | None, cache: dict) -> dict:
    if folder_id in cache:
        return cache[folder_id]
    files: list[dict] = []
    method = "none"
    err = None
    if api_key:
        try:
            files = list_folder_via_api(folder_id, api_key)
            if files:
                method = "drive_api"
        except Exception as e:
            err = f"api:{e}"
    if not files:
        try:
            files = list_folder_via_html(folder_id)
            if files:
                method = "html_ivd"
        except Exception as e:
            err = f"html:{e}"
    images = [f for f in files if str(f.get("mimeType") or "").startswith("image/")]
    # sort by name for stable primary pick
    images.sort(key=lambda f: (f.get("name") or "").lower())
    result = {
        "folder_id": folder_id,
        "folder_url": f"https://drive.google.com/drive/folders/{folder_id}",
        "method": method,
        "error": err if not images else None,
        "files": images,
        "count": len(images),
    }
    cache[folder_id] = result
    time.sleep(0.35)  # be polite to Drive
    return result


def file_urls(file_id: str) -> dict:
    return {
        "id": file_id,
        "view": f"https://drive.google.com/file/d/{file_id}/view?usp=sharing",
        "preview": f"https://drive.google.com/uc?export=view&id={file_id}",
        "thumbnail": f"https://drive.google.com/thumbnail?id={file_id}&sz=w1000",
    }


def pick_primary(files: list[dict]) -> dict | None:
    if not files:
        return None
    # prefer name containing 1 / trước / sau / primary
    def score(f):
        n = (f.get("name") or "").lower()
        s = 0
        if re.search(r"(^|[^\d])1([^\d]|$)|primary|main|dai dien|đại", n):
            s += 10
        if "trước" in n or "truoc" in n or "before" in n:
            s += 2
        if "sau" in n or "after" in n:
            s += 2
        return (-s, n)

    return sorted(files, key=score)[0]


def excel_serial_to_date(v) -> str | None:
    try:
        n = float(v)
    except (TypeError, ValueError):
        s = str(v or "").strip()
        if re.match(r"\d{4}-\d{2}-\d{2}", s):
            return s[:10]
        return s or None
    # Excel serial → approx date (Windows epoch 1899-12-30)
    if 20000 < n < 60000:
        from datetime import date, timedelta

        d = date(1899, 12, 30) + timedelta(days=int(n))
        return d.isoformat()
    return str(v)


def content_hash(obj: dict) -> str:
    blob = json.dumps(obj, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:16]


def yaml_escape(s: str) -> str:
    s = str(s).replace('"', '\\"')
    if any(c in s for c in [":", "#", "{", "}", "[", "]", ",", "\n", "'"]):
        return f'"{s}"'
    return s


def write_atomic(path: Path, text: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)


def truthy_consent(v) -> bool:
    s = str(v or "").strip().lower()
    return s in ("1", "true", "yes", "y", "có", "co", "approved", "ok")


def case_to_yaml(case: dict) -> str:
    lines = [
        "schema_version: 1",
        f"case_id: {yaml_escape(case['case_id'])}",
        f"product_id: {yaml_escape(case.get('product_id') or '')}",
        f"region: {yaml_escape(case.get('region') or '')}",
        f"description: {yaml_escape(case.get('description') or '')}",
        f"doctor: {yaml_escape(case.get('doctor') or '')}",
        f"date: {yaml_escape(case.get('date') or '')}",
        f"followup: {yaml_escape(case.get('followup') or '')}",
        f"notes: {yaml_escape(case.get('notes') or '')}",
        f"consent: {'true' if case.get('consent') else 'false'}",
        f"status: {yaml_escape(case.get('status') or 'draft')}",
        "channels:",
        "  - zalo",
        "  - all",
        "folders:",
        f"  before: {yaml_escape(case.get('folder_before_url') or '')}",
        f"  after: {yaml_escape(case.get('folder_after_url') or '')}",
        "expand:",
        f"  method_before: {yaml_escape(case.get('expand_method_before') or '')}",
        f"  method_after: {yaml_escape(case.get('expand_method_after') or '')}",
        f"  before_count: {case.get('before_count', 0)}",
        f"  after_count: {case.get('after_count', 0)}",
    ]
    pb = case.get("primary_before") or {}
    pa = case.get("primary_after") or {}
    lines += [
        "primary:",
        f"  before_id: {yaml_escape(pb.get('id') or '')}",
        f"  before_name: {yaml_escape(pb.get('name') or '')}",
        f"  before_view: {yaml_escape(pb.get('view') or '')}",
        f"  before_thumb: {yaml_escape(pb.get('thumbnail') or '')}",
        f"  after_id: {yaml_escape(pa.get('id') or '')}",
        f"  after_name: {yaml_escape(pa.get('name') or '')}",
        f"  after_view: {yaml_escape(pa.get('view') or '')}",
        f"  after_thumb: {yaml_escape(pa.get('thumbnail') or '')}",
        "before_files:",
    ]
    for f in case.get("before_files") or []:
        lines.append(f"  - id: {yaml_escape(f['id'])}")
        lines.append(f"    name: {yaml_escape(f.get('name') or '')}")
        lines.append(f"    mimeType: {yaml_escape(f.get('mimeType') or '')}")
        lines.append(f"    view: {yaml_escape(f.get('view') or '')}")
        lines.append(f"    thumbnail: {yaml_escape(f.get('thumbnail') or '')}")
    if not case.get("before_files"):
        lines.append("  []")
    lines.append("after_files:")
    for f in case.get("after_files") or []:
        lines.append(f"  - id: {yaml_escape(f['id'])}")
        lines.append(f"    name: {yaml_escape(f.get('name') or '')}")
        lines.append(f"    mimeType: {yaml_escape(f.get('mimeType') or '')}")
        lines.append(f"    view: {yaml_escape(f.get('view') or '')}")
        lines.append(f"    thumbnail: {yaml_escape(f.get('thumbnail') or '')}")
    if not case.get("after_files"):
        lines.append("  []")
    lines += [
        "sync:",
        f"  content_hash: {yaml_escape(case.get('content_hash') or '')}",
        f"  generated_at: {yaml_escape(case.get('generated_at') or '')}",
        f"  source_xlsx: {yaml_escape(case.get('source_xlsx') or '')}",
        "",
    ]
    # fix empty list artifact when we had files
    text = "\n".join(lines)
    text = text.replace("before_files:\n  []\n", "before_files: []\n")
    text = text.replace("after_files:\n  []\n", "after_files: []\n")
    # if we had files, remove accidental [] after list - simpler rebuild
    return text


def build_case_yaml(case: dict) -> str:
    """Cleaner YAML builder."""
    def dump_files(key: str) -> list[str]:
        files = case.get(key) or []
        if not files:
            return [f"{key}: []"]
        out = [f"{key}:"]
        for f in files:
            out.append(f"  - id: {yaml_escape(f['id'])}")
            out.append(f"    name: {yaml_escape(f.get('name') or '')}")
            out.append(f"    mimeType: {yaml_escape(f.get('mimeType') or '')}")
            out.append(f"    view: {yaml_escape(f.get('view') or '')}")
            out.append(f"    thumbnail: {yaml_escape(f.get('thumbnail') or '')}")
        return out

    pb = case.get("primary_before") or {}
    pa = case.get("primary_after") or {}
    lines = [
        "schema_version: 1",
        f"case_id: {yaml_escape(case['case_id'])}",
        f"product_id: {yaml_escape(case.get('product_id') or '')}",
        f"region: {yaml_escape(case.get('region') or '')}",
        f"description: {yaml_escape(case.get('description') or '')}",
        f"doctor: {yaml_escape(case.get('doctor') or '')}",
        f"date: {yaml_escape(case.get('date') or '')}",
        f"followup: {yaml_escape(case.get('followup') or '')}",
        f"notes: {yaml_escape(case.get('notes') or '')}",
        f"patient_consent_on_file: {'true' if case.get('patient_consent_on_file') else 'false'}",
        f"status: {yaml_escape(case.get('status') or 'ready')}",
        f"usable: {'true' if case.get('usable') else 'false'}",
        "send_mode: on_demand",
        "channels: [zalo, all]",
        "folders:",
        f"  before: {yaml_escape(case.get('folder_before_url') or '')}",
        f"  after: {yaml_escape(case.get('folder_after_url') or '')}",
        "expand:",
        f"  method_before: {yaml_escape(case.get('expand_method_before') or '')}",
        f"  method_after: {yaml_escape(case.get('expand_method_after') or '')}",
        f"  before_count: {int(case.get('before_count') or 0)}",
        f"  after_count: {int(case.get('after_count') or 0)}",
        "primary:",
        f"  before_id: {yaml_escape(pb.get('id') or '')}",
        f"  before_name: {yaml_escape(pb.get('name') or '')}",
        f"  before_view: {yaml_escape(pb.get('view') or '')}",
        f"  before_thumb: {yaml_escape(pb.get('thumbnail') or '')}",
        f"  after_id: {yaml_escape(pa.get('id') or '')}",
        f"  after_name: {yaml_escape(pa.get('name') or '')}",
        f"  after_view: {yaml_escape(pa.get('view') or '')}",
        f"  after_thumb: {yaml_escape(pa.get('thumbnail') or '')}",
    ]
    lines += dump_files("before_files")
    lines += dump_files("after_files")
    lines += [
        "bot_policy:",
        "  # Chỉ gửi khi khách hỏi / cần xem case — không pitch case chủ động.",
        "  send_when: customer_request_only",
        "  max_images_per_reply: 3",
        "  default_send: primary_only",
        "  require_boss_approve_per_send: false",
        "  block_if_usable_false: true",
        "sync:",
        f"  content_hash: {yaml_escape(case.get('content_hash') or '')}",
        f"  generated_at: {yaml_escape(case.get('generated_at') or '')}",
        f"  source_xlsx: {yaml_escape(case.get('source_xlsx') or '')}",
        "",
    ]
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser(description="Expand clinical case folders → case cards")
    ap.add_argument("xlsx", type=Path, help="Path to Database_Chatbot.xlsx")
    ap.add_argument("--brand", default="vicamed")
    ap.add_argument("--sleep", type=float, default=0.35, help="Delay between folder fetches")
    args = ap.parse_args()

    xlsx = args.xlsx.expanduser().resolve()
    if not xlsx.is_file():
        print(f"File not found: {xlsx}", file=sys.stderr)
        sys.exit(1)

    tab_name, rows = parse_xlsx_tab09(xlsx)
    print(f"Tab: {tab_name}  rows_raw={len(rows)}")

    api_key = load_api_key()
    if api_key:
        print("Drive list: API key found (will try API then HTML fallback)")
    else:
        print("Drive list: HTML public folder parse only (set GOOGLE_API_KEY for API)")

    cache: dict = {}
    cases = []
    now = datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")
    n_ok = n_empty = n_skip = 0

    for i, row in enumerate(rows, start=1):
        pid = str(row.get("product_id") or "").strip()
        before_raw = str(row.get("folder_before") or "").strip()
        after_raw = str(row.get("folder_after") or "").strip()
        if not before_raw and not after_raw:
            n_skip += 1
            continue
        if not pid and not before_raw:
            n_skip += 1
            continue

        case_id = str(row.get("case_id") or "").strip() or f"BA-{i:03d}"
        # if case_id looks like template
        if case_id.startswith("BA-001") and "..." in case_id:
            case_id = f"BA-{i:03d}"

        fb = extract_drive_id(before_raw)
        fa = extract_drive_id(after_raw)

        before_exp = list_folder(fb, api_key, cache) if fb else {
            "folder_id": None, "folder_url": "", "method": "none", "files": [], "count": 0, "error": "missing"
        }
        after_exp = list_folder(fa, api_key, cache) if fa else {
            "folder_id": None, "folder_url": "", "method": "none", "files": [], "count": 0, "error": "missing"
        }

        def enrich(files: list[dict]) -> list[dict]:
            out = []
            for f in files:
                u = file_urls(f["id"])
                out.append({**f, **u})
            return out

        before_files = enrich(before_exp.get("files") or [])
        after_files = enrich(after_exp.get("files") or [])
        primary_b = pick_primary(before_files)
        primary_a = pick_primary(after_files)

        # Sheet SoT = case allowed for bot. Optional columns override.
        # send_mode always on_demand (customer asks) — not boss-gate.
        if "status" in row and str(row.get("status") or "").strip():
            status = str(row.get("status")).strip().lower()
        else:
            status = "ready"
        if "consent" in row and str(row.get("consent") or "").strip():
            patient_consent_on_file = truthy_consent(row.get("consent"))
        else:
            # Tab 09 warning: only cases with patient paper consent are entered.
            # Default true for rows present on sheet; set consent=false on sheet to block.
            patient_consent_on_file = True
        if status in ("blocked", "draft", "hidden", "no"):
            usable = False
        else:
            usable = patient_consent_on_file and status not in ("rejected",)

        core = {
            "case_id": case_id,
            "product_id": pid,
            "region": str(row.get("region") or "").strip(),
            "description": str(row.get("description") or "").strip(),
            "doctor": str(row.get("doctor") or "").strip(),
            "date": excel_serial_to_date(row.get("date_raw")),
            "followup": str(row.get("followup") or "").strip(),
            "notes": str(row.get("notes") or "").strip(),
            "patient_consent_on_file": patient_consent_on_file,
            "status": status,
            "usable": usable,
            "send_mode": "on_demand",
            "folder_before_id": fb,
            "folder_after_id": fa,
            "folder_before_url": before_exp.get("folder_url") or before_raw,
            "folder_after_url": after_exp.get("folder_url") or after_raw,
            "expand_method_before": before_exp.get("method"),
            "expand_method_after": after_exp.get("method"),
            "before_count": len(before_files),
            "after_count": len(after_files),
            "before_files": before_files,
            "after_files": after_files,
            "primary_before": primary_b,
            "primary_after": primary_a,
            "generated_at": now,
            "source_xlsx": str(xlsx),
        }
        core["content_hash"] = content_hash(
            {
                "case_id": case_id,
                "product_id": pid,
                "before": [f["id"] for f in before_files],
                "after": [f["id"] for f in after_files],
            }
        )
        cases.append(core)

        flag = "OK" if before_files or after_files else "EMPTY"
        if flag == "OK":
            n_ok += 1
        else:
            n_empty += 1
        print(
            f"  [{flag}] {case_id} {pid or '-'}  "
            f"before={len(before_files)}({before_exp.get('method')})  "
            f"after={len(after_files)}({after_exp.get('method')})"
        )

    out_dir = KITS / args.brand / "cases"
    cache_dir = KITS / args.brand / "sheet-cache"
    out_dir.mkdir(parents=True, exist_ok=True)
    cache_dir.mkdir(parents=True, exist_ok=True)

    # wipe old generated cards for clean rebuild
    for old in out_dir.glob("BA-*.yaml"):
        old.unlink()

    for case in cases:
        write_atomic(out_dir / f"{case['case_id']}.yaml", build_case_yaml(case))

    summary = {
        "brand": args.brand,
        "source_xlsx": str(xlsx),
        "tab": tab_name,
        "generated_at": now,
        "counts": {
            "cases": len(cases),
            "expanded_ok": n_ok,
            "expanded_empty": n_empty,
            "skipped_rows": n_skip,
        },
        "cases": [
            {
                "case_id": c["case_id"],
                "product_id": c["product_id"],
                "usable": c["usable"],
                "status": c["status"],
                "send_mode": c.get("send_mode"),
                "before_count": c["before_count"],
                "after_count": c["after_count"],
                "primary_before_id": (c.get("primary_before") or {}).get("id"),
                "primary_after_id": (c.get("primary_after") or {}).get("id"),
                "folder_before_id": c.get("folder_before_id"),
                "folder_after_id": c.get("folder_after_id"),
            }
            for c in cases
        ],
    }
    write_atomic(
        cache_dir / "09_cases.json",
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n",
    )

    # Token-tight agent index: drive:FILE_ID only (SA/API resolves at send time)
    min_rows = []
    for c in cases:
        if not c.get("usable", True):
            continue
        ids: list[str] = []
        pb = c.get("primary_before") or {}
        pa = c.get("primary_after") or {}
        if pb.get("id"):
            ids.append(f"drive:{pb['id']}")
        if pa.get("id"):
            ids.append(f"drive:{pa['id']}")
        # optional 3rd angle only if primary before has sibling
        bfs = c.get("before_files") or []
        if len(ids) < 3 and len(bfs) > 1 and bfs[1].get("id"):
            extra = f"drive:{bfs[1]['id']}"
            if extra not in ids:
                ids.append(extra)
        ids = ids[:3]
        if not ids:
            continue
        region = (c.get("region") or "").strip()
        if len(region) > 24 or "\n" in region or region.startswith("description"):
            region = region[:24] if region and not region.startswith("description") else ""
        min_rows.append(
            {
                "id": c["case_id"],
                "sp": c.get("product_id") or "",
                "v": region,
                "u": ids,
            }
        )
    min_index = {
        "v": 1,
        "rule": "send-images urls=u message=\"\" | drive:ID via SA | only this file",
        "n": len(min_rows),
        "c": min_rows,
    }
    write_atomic(
        out_dir / "index.min.json",
        json.dumps(min_index, ensure_ascii=False, separators=(",", ":")) + "\n",
    )

    print()
    print(f"Wrote {len(cases)} case cards → {out_dir}")
    print(f"Index → {cache_dir / '09_cases.json'}")
    print(f"Token index → {out_dir / 'index.min.json'} ({(out_dir / 'index.min.json').stat().st_size} bytes)")
    print(f"OK expand: {n_ok}  empty: {n_empty}  skipped: {n_skip}")
    print()
    print("Policy: on_demand URL send-images; agent reads index.min.json only (token-tight).")
    if n_empty:
        print(
            "Tip: EMPTY folder → share folder as Anyone with the link (Viewer), "
            "or set GOOGLE_API_KEY with Drive API enabled."
        )


if __name__ == "__main__":
    main()
