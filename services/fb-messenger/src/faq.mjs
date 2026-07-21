/**
 * Safe FAQ — only approved contact + product names from brand-kits.
 * No invented medical claims (Vicamed approves cards).
 */
import fs from "node:fs";
import path from "node:path";
import { BRAND_KITS } from "./config.mjs";

function readContact() {
  const p = path.join(BRAND_KITS, "contact.yaml");
  if (!fs.existsSync(p)) return null;
  const t = fs.readFileSync(p, "utf8");
  const phone = (t.match(/phone:\s*"?([0-9.+]+)"?/) || [])[1];
  const display = (t.match(/display:\s*"([^"]+)"/) || [])[1];
  const email = (t.match(/email:\s*"([^"]+)"/) || [])[1];
  const website = (t.match(/website:\s*"([^"]+)"/) || [])[1];
  const branches = [];
  const re = /name:\s*(.+)\n\s+address:\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(t))) {
    branches.push({ name: m[1].trim(), address: m[2] });
  }
  return { phone, display, email, website, branches };
}

function listProducts() {
  const dir = path.join(BRAND_KITS, "products");
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".yaml")) continue;
    const t = fs.readFileSync(path.join(dir, f), "utf8");
    if (!/status:\s*approved/.test(t)) continue;
    const id = (t.match(/^\s+id:\s*(\S+)/m) || [])[1];
    const name = (t.match(/^\s+name:\s*(.+)$/m) || [])[1];
    if (id && name) out.push({ id, name: name.trim() });
  }
  return out;
}

export function buildSafeReply(text) {
  const q = (text || "").toLowerCase();
  const contact = readContact();
  const products = listProducts();

  if (/hotline|sđt|so dien thoai|số điện thoại|liên hệ|contact|gọi/.test(q)) {
    if (contact?.phone) {
      return (
        `Hotline Vicamed: ${contact.display || contact.phone}\n` +
        (contact.email ? `Email: ${contact.email}\n` : "") +
        (contact.website ? `Web: ${contact.website}` : "") +
        `\n\nEm hỗ trợ thông tin đã duyệt; chỉ định/điều trị do bác sĩ sau thăm khám.`
      );
    }
    return "Hiện chưa có hotline đã duyệt trên hệ thống. Anh/chị để lại SĐT, CSKH sẽ liên hệ ạ.";
  }

  if (/địa chỉ|dia chi|ở đâu|chi nhánh|hà nội|hcm|sài gòn/.test(q)) {
    if (contact?.branches?.length) {
      return (
        contact.branches.map((b) => `• ${b.name}: ${b.address}`).join("\n") +
        (contact.phone ? `\nHotline: ${contact.display || contact.phone}` : "")
      );
    }
    return "Địa chỉ: xem https://www.vicamed.vn/pages/lien-he";
  }

  if (/sản phẩm|san pham|catalog|danh mục|filler|hyafilia|xspurt|porzellan|olidia|dorothy|bảng giá|gia /.test(q)) {
    if (!products.length) {
      return "Catalog đang cập nhật. Anh/chị gọi hotline hoặc để lại SĐT để CSKH tư vấn ạ.";
    }
    const list = products
      .slice(0, 9)
      .map((p) => `• ${p.name} (${p.id})`)
      .join("\n");
    return (
      `Sản phẩm đã có card duyệt (Vicamed):\n${list}\n\n` +
      `Muốn giá/claim chi tiết cho 1 SP, nhắn đúng tên (vd Hyafilia Soft). ` +
      `Chỉ định lâm sàng do bác sĩ quyết định.\n` +
      (contact?.phone
        ? `Hotline: ${contact.display || contact.phone}`
        : "")
    );
  }

  if (/zalo|chuyển zalo|nhắn zalo|sale/.test(q)) {
    return (
      "Nếu anh/chị đồng ý, em có thể chuyển CSKH/sale liên hệ qua Zalo hoặc điện thoại. " +
      "Vui lòng trả lời: ĐỒNG Ý ZALO và để lại số điện thoại (nếu muốn). " +
      "Không đồng ý thì em hỗ trợ tiếp trên Messenger trong khung 24h."
    );
  }

  if (/đồng ý zalo|dong y zalo|consent zalo/.test(q)) {
    return (
      "Đã ghi nhận yêu cầu đồng ý Zalo. CSKH sẽ liên hệ khi có số và quy trình handoff. " +
      "Hotline: " +
      (contact?.display || contact?.phone || "xem web Vicamed")
    );
  }

  // default short
  return (
    "Xin chào, em là trợ lý Page Vicamed.\n" +
    "Em hỗ trợ: hotline/địa chỉ, danh mục SP đã duyệt, chuyển CSKH.\n" +
    "Không chẩn đoán / không cam kết điều trị qua chat.\n" +
    "Gõ: hotline | địa chỉ | sản phẩm | chuyển Zalo\n" +
    (contact?.phone ? `Hotline: ${contact.display || contact.phone}` : "")
  );
}
