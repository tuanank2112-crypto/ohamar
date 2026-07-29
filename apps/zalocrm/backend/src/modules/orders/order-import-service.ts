// SPDX-License-Identifier: AGPL-3.0-or-later
import ExcelJS from 'exceljs';
import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/database/prisma-client.js';
import { normalizeVnMobile } from '../../shared/utils/phone.js';
import { parseCsvRows } from '../knowledge/document-extractor.js';
import { sha256 } from '../knowledge/chunking.js';

export type ColumnMapping = Partial<Record<'externalId' | 'customerCode' | 'customerPhone' | 'customerZaloUid' | 'status' | 'orderedAt' | 'currency' | 'sku' | 'itemName' | 'quantity' | 'unitPrice' | 'total', string>>;
export type RawRow = Record<string, unknown>;
export type NormalizedOrderRow = {
  row: number; externalId: string; customerCode: string | null; customerPhone: string | null;
  customerZaloUid: string | null; status: string; orderedAt: string | null; currency: string;
  sku: string | null; itemName: string; quantity: number; unitPrice: number; total: number;
};

const REQUIRED = ['externalId', 'itemName'] as const;

function number(value: unknown, fallback = 0): number {
  if (value == null || value === '') return fallback;
  const parsed = Number(String(value).replace(/[,.](?=\d{3}(?:\D|$))/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function normalizeOrderRows(rows: RawRow[], mapping: ColumnMapping) {
  const errors: Array<{ row: number; errors: string[]; raw: RawRow }> = [];
  const valid: NormalizedOrderRow[] = [];
  rows.forEach((raw, index) => {
    const get = (key: keyof ColumnMapping) => raw[mapping[key] || key];
    const rowErrors: string[] = [];
    for (const key of REQUIRED) if (!String(get(key) ?? '').trim()) rowErrors.push(`${key} is required`);
    const quantity = number(get('quantity'), 1);
    const unitPrice = number(get('unitPrice'), 0);
    const calculatedTotal = Number.isFinite(quantity) && Number.isFinite(unitPrice) ? quantity * unitPrice : Number.NaN;
    const hasExplicitTotal = get('total') != null && String(get('total')).trim() !== '';
    const explicitTotal = number(get('total'), calculatedTotal);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 10_000) rowErrors.push('quantity must be > 0 and <= 10,000'); // FIX S-11
    if (!Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 1_000_000_000) rowErrors.push('unitPrice must be >= 0 and <= 1,000,000,000'); // FIX S-11
    if (!Number.isFinite(explicitTotal) || explicitTotal < 0 || explicitTotal > 10_000_000_000) rowErrors.push('total must be >= 0 and <= 10,000,000,000'); // FIX S-11
    if (hasExplicitTotal && Number.isFinite(explicitTotal) && Number.isFinite(calculatedTotal)) {
      const tolerance = Math.max(1, Math.abs(calculatedTotal) * 0.001);
      if (Math.abs(explicitTotal - calculatedTotal) > tolerance) {
        rowErrors.push(`total mismatch: expected ${calculatedTotal} from quantity × unitPrice`);
      }
    }
    const dateRaw = get('orderedAt');
    const orderedAt = dateRaw ? new Date(String(dateRaw)) : null;
    if (orderedAt && Number.isNaN(orderedAt.getTime())) rowErrors.push('orderedAt is invalid');
    const phoneRaw = String(get('customerPhone') ?? '').trim();
    const normalizedPhone = phoneRaw ? normalizeVnMobile(phoneRaw) : null;
    if (phoneRaw && !normalizedPhone) rowErrors.push('customerPhone is invalid');
    if (rowErrors.length) { errors.push({ row: index + 2, errors: rowErrors, raw }); return; }
    valid.push({
      row: index + 2,
      externalId: String(get('externalId')).trim(), customerCode: String(get('customerCode') ?? '').trim() || null,
      customerPhone: normalizedPhone, customerZaloUid: String(get('customerZaloUid') ?? '').trim() || null,
      status: String(get('status') ?? 'new').trim() || 'new', orderedAt: orderedAt?.toISOString() ?? null,
      currency: String(get('currency') ?? 'VND').trim().toUpperCase() || 'VND',
      sku: String(get('sku') ?? '').trim().toUpperCase() || null, itemName: String(get('itemName')).trim(),
      quantity, unitPrice, total: calculatedTotal,
    });
  });
  return { valid, errors };
}

export async function parseOrderFile(fileName: string, buffer: Buffer): Promise<RawRow[]> {
  const ext = fileName.toLowerCase().split('.').pop();
  let matrix: unknown[][];
  if (ext === 'csv') matrix = parseCsvRows(buffer.toString('utf8'));
  else if (ext === 'xlsx') {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const sheet = workbook.worksheets[0];
    if (!sheet) return [];
    matrix = [];
    sheet.eachRow((row) => matrix.push((row.values as unknown[]).slice(1)));
  } else throw new Error('Only CSV and XLSX order imports are supported');
  const headers = (matrix[0] || []).map((value) => String(value ?? '').trim());
  return matrix.slice(1).filter((row) => row.some((cell) => String(cell ?? '').trim())).map((row) => Object.fromEntries(headers.map((header, i) => [header, row[i] ?? ''])));
}

export async function createOrderPreview(input: { orgId: string; userId: string; fileName?: string; rows: RawRow[]; mapping: ColumnMapping }) {
  if (!input.rows.length) throw new Error('Import contains no data rows');
  if (input.rows.length > 20_000) throw new Error('Import is limited to 20,000 rows');
  const normalized = normalizeOrderRows(input.rows, input.mapping);
  const checksum = sha256(JSON.stringify({ rows: input.rows, mapping: input.mapping }));
  const existing = await prisma.orderImportBatch.findUnique({ where: { orgId_checksum: { orgId: input.orgId, checksum } } });
  if (existing) return { batch: existing, duplicate: true };
  const batch = await prisma.orderImportBatch.create({
    data: {
      orgId: input.orgId, createdById: input.userId, fileName: input.fileName, checksum,
      mapping: input.mapping as Prisma.InputJsonValue, previewRows: normalized.valid as unknown as Prisma.InputJsonValue,
      errorRows: normalized.errors as unknown as Prisma.InputJsonValue, totalRows: input.rows.length, failedRows: normalized.errors.length,
    },
  });
  return { batch, duplicate: false };
}

export async function commitOrderImport(orgId: string, batchId: string) {
  const batch = await prisma.orderImportBatch.findFirst({ where: { id: batchId, orgId } });
  if (!batch) throw new Error('Order import batch not found');
  if (batch.status === 'completed') return batch;
  const rows = batch.previewRows as unknown as NormalizedOrderRow[];
  const grouped = new Map<string, NormalizedOrderRow[]>();
  for (const row of rows) grouped.set(row.externalId, [...(grouped.get(row.externalId) ?? []), row]);
  let imported = 0, updated = 0;
  await prisma.orderImportBatch.update({ where: { id: batch.id }, data: { status: 'processing' } });
  try {
    for (const [externalId, orderRows] of grouped) {
      await prisma.$transaction(async (tx) => {
        const head = orderRows[0];
        const existing = await tx.order.findUnique({ where: { orgId_externalId: { orgId, externalId } }, select: { id: true } });
        let contactId: string | null = null;
        if (head.customerZaloUid || head.customerPhone) {
          const contact = await tx.contact.findFirst({ where: { orgId, OR: [
            ...(head.customerZaloUid ? [{ zaloUid: head.customerZaloUid }] : []),
            ...(head.customerPhone ? [{ phoneNormalized: head.customerPhone }] : []),
          ] }, select: { id: true } });
          contactId = contact?.id ?? null;
        }
        const total = orderRows.reduce((sum, row) => sum + row.total, 0);
        const order = await tx.order.upsert({
          where: { orgId_externalId: { orgId, externalId } },
          create: { orgId, externalId, contactId, importBatchId: batch.id, customerCode: head.customerCode, customerPhone: head.customerPhone, customerZaloUid: head.customerZaloUid, status: head.status, currency: head.currency, subtotal: total, total, orderedAt: head.orderedAt ? new Date(head.orderedAt) : null },
          update: { contactId, importBatchId: batch.id, customerCode: head.customerCode, customerPhone: head.customerPhone, customerZaloUid: head.customerZaloUid, status: head.status, currency: head.currency, subtotal: total, total, orderedAt: head.orderedAt ? new Date(head.orderedAt) : null },
        });
        await tx.orderItem.deleteMany({ where: { orderId: order.id } });
        const skus = orderRows.map((row) => row.sku).filter((sku): sku is string => Boolean(sku));
        const catalog = skus.length ? await tx.catalogItem.findMany({ where: { orgId, sku: { in: skus } }, select: { id: true, sku: true } }) : [];
        const catalogBySku = new Map(catalog.map((item) => [item.sku, item.id]));
        await tx.orderItem.createMany({ data: orderRows.map((row) => ({ orderId: order.id, catalogItemId: row.sku ? catalogBySku.get(row.sku) ?? null : null, sku: row.sku, name: row.itemName, quantity: row.quantity, unitPrice: row.unitPrice, total: row.total })) });
        if (existing) updated += 1; else imported += 1;
      });
    }
    return prisma.orderImportBatch.update({ where: { id: batch.id }, data: { status: 'completed', importedRows: imported, updatedRows: updated, committedAt: new Date() } });
  } catch (error) {
    await prisma.orderImportBatch.update({ where: { id: batch.id }, data: { status: 'failed' } });
    throw error;
  }
}
