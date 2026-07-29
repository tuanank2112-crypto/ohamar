// SPDX-License-Identifier: AGPL-3.0-or-later
import ExcelJS from 'exceljs';

export type SupportedDocumentType = 'pdf' | 'docx' | 'xlsx' | 'csv' | 'txt';

export function detectDocumentType(fileName: string, mimeType: string, buffer: Buffer): SupportedDocumentType {
  const ext = fileName.toLowerCase().split('.').pop() || '';
  if (ext === 'pdf' && buffer.subarray(0, 5).toString() === '%PDF-') return 'pdf';
  if ((ext === 'docx' || ext === 'xlsx') && buffer[0] === 0x50 && buffer[1] === 0x4b) return ext;
  if (ext === 'csv' || mimeType.includes('csv')) return 'csv';
  if (ext === 'txt' || mimeType.startsWith('text/plain')) return 'txt';
  throw new Error('Unsupported file or invalid magic bytes. Use PDF, DOCX, XLSX, CSV or TXT.');
}

export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"' && quoted && text[i + 1] === '"') { field += '"'; i += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === ',' && !quoted) { row.push(field); field = ''; continue; }
    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field); if (row.some((cell) => cell.trim())) rows.push(row); row = []; field = ''; continue;
    }
    field += char;
  }
  row.push(field); if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

export async function extractDocumentText(type: SupportedDocumentType, buffer: Buffer): Promise<string> {
  if (type === 'txt') return buffer.toString('utf8');
  if (type === 'csv') return parseCsvRows(buffer.toString('utf8')).map((row) => row.join(' | ')).join('\n');
  if (type === 'xlsx') {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const lines: string[] = [];
    workbook.eachSheet((sheet) => {
      lines.push(`# ${sheet.name}`);
      sheet.eachRow((row) => {
        const values = Array.isArray(row.values) ? row.values.slice(1) : [];
        lines.push(values.map((value: unknown) => String(value ?? '')).join(' | '));
      });
    });
    return lines.join('\n');
  }
  if (type === 'docx') {
    const specifier: string = 'mammoth';
    const mod = await import(specifier) as { extractRawText?: (input: { buffer: Buffer }) => Promise<{ value: string }> ; default?: { extractRawText: (input: { buffer: Buffer }) => Promise<{ value: string }> } };
    const extract = mod.extractRawText ?? mod.default?.extractRawText;
    if (!extract) throw new Error('DOCX extractor is unavailable');
    return (await extract({ buffer })).value;
  }
  const specifier: string = 'pdf-parse';
  const mod = await import(specifier) as { default?: (input: Buffer) => Promise<{ text: string }> };
  const parse = mod.default;
  if (!parse) throw new Error('PDF extractor is unavailable');
  return (await parse(buffer)).text;
}
