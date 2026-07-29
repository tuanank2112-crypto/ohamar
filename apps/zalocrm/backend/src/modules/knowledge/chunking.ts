// SPDX-License-Identifier: AGPL-3.0-or-later
import { createHash } from 'node:crypto';

export type TextChunk = { position: number; content: string; tokenCount: number; checksum: string };

export function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function normalizeKnowledgeText(input: string): string {
  return input
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function chunkKnowledgeText(input: string, maxChars = 1800, overlapChars = 240): TextChunk[] {
  const text = normalizeKnowledgeText(input);
  if (!text) return [];
  const chunks: TextChunk[] = [];
  const seen = new Set<string>();
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + maxChars);
    if (end < text.length) {
      const boundary = Math.max(text.lastIndexOf('\n\n', end), text.lastIndexOf('. ', end), text.lastIndexOf(' ', end));
      if (boundary > start + Math.floor(maxChars * 0.55)) end = boundary + 1;
    }
    const content = text.slice(start, end).trim();
    if (content) {
      const checksum = sha256(content);
      if (!seen.has(checksum)) {
        seen.add(checksum);
        chunks.push({ position: chunks.length, content, tokenCount: Math.max(1, Math.ceil(content.length / 4)), checksum });
      }
    }
    if (end >= text.length) break;
    start = Math.max(start + 1, end - overlapChars);
  }
  return chunks;
}
