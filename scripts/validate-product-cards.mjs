#!/usr/bin/env node
/**
 * Validate brand-kits product + price cards (Phase 4/6 helper).
 * Usage: node scripts/validate-product-cards.mjs [--brand vicamed]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const KITS = path.join(ROOT, "workspace", "brand-kits");

const brandArg = process.argv.includes("--brand")
  ? process.argv[process.argv.indexOf("--brand") + 1]
  : null;

function parseSimpleYaml(text) {
  // Minimal YAML subset for our cards (no nested arrays of objects via full parser).
  // Prefer JSON-like validation via regex extraction for required keys.
  return text;
}

function hasKey(text, key) {
  const re = new RegExp(`^\\s*${key}\\s*:`, "m");
  return re.test(text);
}

function getStatus(text) {
  const m = text.match(/^\s*status:\s*["']?(\w+)/m) || text.match(/status:\s*["']?(\w+)/);
  // product cards nest under approval.status
  const m2 = text.match(/approval:[\s\S]*?status:\s*["']?(\w+)/);
  return (m2 && m2[1]) || (m && m[1]) || null;
}

function validateProduct(file, text) {
  const errs = [];
  for (const k of ["schema_version", "product:", "approval:", "sales:", "sync:"]) {
    if (!text.includes(k.replace(":", "")) && !text.includes(k)) {
      // product: with colon
    }
  }
  if (!hasKey(text, "schema_version")) errs.push("missing schema_version");
  if (!text.includes("product:")) errs.push("missing product");
  if (!text.includes("approval:")) errs.push("missing approval");
  if (!text.includes("sales:")) errs.push("missing sales");
  if (!text.includes("sync:")) errs.push("missing sync");
  if (!text.includes("approved_claims:")) errs.push("missing approved_claims");
  if (!text.includes("forbidden_claims:")) errs.push("missing forbidden_claims");
  if (!text.includes("content_hash:")) errs.push("missing content_hash");
  const st = getStatus(text);
  if (st && !["draft", "approved", "expired"].includes(st)) {
    errs.push(`bad status ${st}`);
  }
  // Whitelist smell: empty approved_claims
  if (/approved_claims:\s*\[\s*\]/.test(text)) {
    errs.push("approved_claims empty");
  }
  return errs;
}

function validatePrice(file, text) {
  const errs = [];
  for (const k of [
    "schema_version",
    "product_id",
    "price",
    "currency",
    "status",
    "valid_from",
    "valid_until",
    "content_hash",
  ]) {
    if (!hasKey(text, k) && !text.includes(`${k}:`)) errs.push(`missing ${k}`);
  }
  return errs;
}

function walkBrand(brand) {
  const base = path.join(KITS, brand);
  const productsDir = path.join(base, "products");
  const pricesDir = path.join(base, "prices");
  let errors = 0;
  let ok = 0;

  if (!fs.existsSync(productsDir)) {
    console.error(`No products dir: ${productsDir}`);
    return 1;
  }

  for (const f of fs.readdirSync(productsDir).filter((x) => x.endsWith(".yaml"))) {
    const fp = path.join(productsDir, f);
    const text = fs.readFileSync(fp, "utf8");
    const errs = validateProduct(fp, text);
    if (errs.length) {
      console.error(`FAIL product ${f}:`, errs.join("; "));
      errors++;
    } else {
      console.log(`OK product ${f}`);
      ok++;
    }
    // matching price optional but warn
    const id = f.replace(/\.yaml$/, "");
    const pricePath = path.join(pricesDir, `${id}.yaml`);
    if (fs.existsSync(pricePath)) {
      const pt = fs.readFileSync(pricePath, "utf8");
      const perrs = validatePrice(pricePath, pt);
      if (perrs.length) {
        console.error(`FAIL price ${id}:`, perrs.join("; "));
        errors++;
      } else console.log(`OK price ${id}`);
    } else {
      console.warn(`WARN no price card for ${id}`);
    }
  }
  console.log(`\n${brand}: ${ok} products checked, ${errors} error(s)`);
  return errors;
}

const brands = brandArg
  ? [brandArg]
  : fs.readdirSync(KITS).filter((d) => {
      const p = path.join(KITS, d);
      return fs.statSync(p).isDirectory() && !d.startsWith("_") && d !== "node_modules";
    }).filter((d) => fs.existsSync(path.join(KITS, d, "products")));

let code = 0;
for (const b of brands) {
  if (b === "README.md" || b.endsWith(".md")) continue;
  code += walkBrand(b);
}
process.exit(code > 0 ? 1 : 0);
