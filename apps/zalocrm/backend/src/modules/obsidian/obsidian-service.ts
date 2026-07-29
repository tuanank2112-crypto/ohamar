// SPDX-License-Identifier: AGPL-3.0-or-later
import path from 'node:path';
import { access, readdir, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

import { config } from '../../config/index.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { sha256 } from '../knowledge/chunking.js';
import { ingestKnowledgeDocument } from '../knowledge/knowledge-service.js';

const APPROVED_DIR = '90_Approved_For_AI';
const SOURCE_TYPE = 'obsidian_markdown';

type Frontmatter = Record<string, string | boolean>;

export type ObsidianSyncResult = {
  enabled: boolean;
  vaultPath: string;
  approvedDir: string;
  dryRun: boolean;
  scanned: number;
  eligible: number;
  imported: number;
  duplicates: number;
  skipped: Array<{ file: string; reason: string }>;
  failed: Array<{ file: string; error: string }>;
  documents: Array<{ file: string; documentId?: string; title: string; status: string; duplicate?: boolean }>;
};

function requireVaultPath(): string {
  const vaultPath = config.obsidianVaultPath.trim();
  if (!config.obsidianSyncEnabled || !vaultPath) {
    throw new Error('Obsidian sync is not enabled. Set OBSIDIAN_SYNC_ENABLED=true and OBSIDIAN_VAULT_PATH.');
  }
  return path.resolve(vaultPath);
}

async function exists(target: string): Promise<boolean> {
  try {
    await access(target, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function listMarkdownFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      files.push(fullPath);
    }
  }
  return files;
}

function parseFrontmatter(markdown: string): { meta: Frontmatter; body: string } {
  if (!markdown.startsWith('---')) return { meta: {}, body: markdown };
  const end = markdown.indexOf('\n---', 3);
  if (end < 0) return { meta: {}, body: markdown };
  const raw = markdown.slice(3, end).trim();
  const body = markdown.slice(end + 4).trim();
  const meta: Frontmatter = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const rawValue = match[2].trim().replace(/^['"]|['"]$/g, '');
    if (/^(true|false)$/i.test(rawValue)) meta[key] = rawValue.toLowerCase() === 'true';
    else meta[key] = rawValue;
  }
  return { meta, body };
}

function isApprovedForAi(meta: Frontmatter): boolean {
  return String(meta.status || '').toLowerCase() === 'approved'
    && meta.usable_by_ai === true
    && meta.pii_redacted === true;
}

function titleFor(relativePath: string, body: string): string {
  const heading = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (heading) return heading.slice(0, 180);
  return path.basename(relativePath, path.extname(relativePath)).replace(/[_-]+/g, ' ').slice(0, 180);
}

async function approveDocument(orgId: string, userId: string, documentId: string) {
  const document = await prisma.knowledgeDocument.findFirst({ where: { id: documentId, orgId }, select: { id: true, status: true } });
  if (!document || !['ready', 'approved'].includes(document.status)) return document;
  await prisma.$transaction([
    prisma.knowledgeChunk.updateMany({ where: { documentId, orgId }, data: { status: 'approved' } }),
    prisma.knowledgeDocument.update({ where: { id: documentId }, data: { status: 'approved', approvedById: userId, approvedAt: new Date() } }),
  ]);
  return prisma.knowledgeDocument.findFirst({ where: { id: documentId, orgId }, select: { id: true, status: true } });
}

export async function getObsidianStatus() {
  const vaultPath = config.obsidianVaultPath.trim();
  const resolvedVault = vaultPath ? path.resolve(vaultPath) : '';
  const approvedDir = resolvedVault ? path.join(resolvedVault, APPROVED_DIR) : '';
  const approvedDirExists = approvedDir ? await exists(approvedDir) : false;
  const files = approvedDirExists ? await listMarkdownFiles(approvedDir) : [];
  return {
    enabled: config.obsidianSyncEnabled,
    vaultPath: resolvedVault,
    approvedDir,
    approvedDirExists,
    markdownFiles: files.length,
  };
}

export async function syncApprovedObsidianNotes(orgId: string, userId: string, options: { dryRun?: boolean } = {}): Promise<ObsidianSyncResult> {
  const vaultPath = requireVaultPath();
  const approvedDir = path.join(vaultPath, APPROVED_DIR);
  if (!await exists(approvedDir)) throw new Error(`Approved folder not found: ${approvedDir}`);

  const files = await listMarkdownFiles(approvedDir);
  const result: ObsidianSyncResult = {
    enabled: true,
    vaultPath,
    approvedDir,
    dryRun: Boolean(options.dryRun),
    scanned: files.length,
    eligible: 0,
    imported: 0,
    duplicates: 0,
    skipped: [],
    failed: [],
    documents: [],
  };

  for (const file of files) {
    const relativePath = path.relative(vaultPath, file);
    try {
      const raw = await readFile(file, 'utf8');
      const { meta, body } = parseFrontmatter(raw);
      if (!isApprovedForAi(meta)) {
        result.skipped.push({ file: relativePath, reason: 'missing approved/usable_by_ai/pii_redacted frontmatter' });
        continue;
      }
      const text = body.trim();
      if (text.length < 10) {
        result.skipped.push({ file: relativePath, reason: 'content too short' });
        continue;
      }

      result.eligible += 1;
      const title = titleFor(relativePath, text);
      if (options.dryRun) {
        result.documents.push({ file: relativePath, title, status: 'dry_run' });
        continue;
      }

      const checksum = sha256(text);
      const previous = await prisma.knowledgeDocument.findFirst({
        where: { orgId, sourceType: SOURCE_TYPE, fileName: relativePath, status: { not: 'archived' } },
        select: { id: true, checksum: true, status: true },
        orderBy: { updatedAt: 'desc' },
      });
      if (previous && previous.checksum !== checksum) {
        await prisma.$transaction([
          prisma.knowledgeChunk.updateMany({ where: { documentId: previous.id, orgId }, data: { status: 'archived' } }),
          prisma.knowledgeDocument.update({ where: { id: previous.id }, data: { status: 'archived' } }),
        ]);
      }

      const ingested = await ingestKnowledgeDocument({
        orgId,
        userId,
        title,
        text,
        sourceType: SOURCE_TYPE,
        fileName: relativePath,
        mimeType: 'text/markdown',
      });
      const approved = await approveDocument(orgId, userId, ingested.document.id);
      if (ingested.duplicate) result.duplicates += 1;
      else result.imported += 1;
      result.documents.push({
        file: relativePath,
        documentId: ingested.document.id,
        title,
        status: approved?.status ?? ingested.document.status,
        duplicate: ingested.duplicate,
      });
    } catch (error) {
      result.failed.push({ file: relativePath, error: (error as Error).message });
    }
  }

  return result;
}

