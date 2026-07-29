// SPDX-License-Identifier: AGPL-3.0-or-later
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { config } from '../../config/index.js';

export interface ZaloCredentials {
  cookie: unknown;
  imei: string;
  userAgent: string;
}

export interface SessionColumns {
  sessionCiphertext?: string | null;
  sessionData?: unknown;
}

const VERSION = 1;
const IV_BYTES = 12;

function key(): Buffer {
  return createHash('sha256').update(config.encryptionKey, 'utf8').digest();
}

export function isValidZaloCredentials(value: unknown): value is ZaloCredentials {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return Boolean(candidate.cookie && typeof candidate.imei === 'string' && candidate.imei &&
    typeof candidate.userAgent === 'string' && candidate.userAgent);
}

export function encryptZaloSession(credentials: ZaloCredentials): string {
  if (!isValidZaloCredentials(credentials)) throw new Error('Invalid Zalo credentials');
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(`zalo-session:v${VERSION}`));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(credentials), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `v${VERSION}.${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
}

export function decryptZaloSession(record: SessionColumns | null | undefined): ZaloCredentials | null {
  if (!record) return null;
  if (record.sessionCiphertext) {
    const [version, ivRaw, tagRaw, dataRaw] = record.sessionCiphertext.split('.');
    if (version !== `v${VERSION}` || !ivRaw || !tagRaw || !dataRaw) {
      throw new Error('Unsupported or corrupted Zalo session ciphertext');
    }
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivRaw, 'base64url'));
    decipher.setAAD(Buffer.from(`zalo-session:v${VERSION}`));
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(dataRaw, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
    const parsed: unknown = JSON.parse(plain);
    if (!isValidZaloCredentials(parsed)) throw new Error('Decrypted Zalo session is invalid');
    return parsed;
  }
  return isValidZaloCredentials(record.sessionData) ? record.sessionData : null;
}

export function encryptedSessionUpdate(credentials: ZaloCredentials) {
  return {
    sessionCiphertext: encryptZaloSession(credentials),
    sessionKeyVersion: VERSION,
    sessionData: Prisma.JsonNull,
  };
}

export const SAVED_SESSION_WHERE: Prisma.ZaloAccountWhereInput = {
  OR: [
    { sessionCiphertext: { not: null } },
    { sessionData: { not: Prisma.JsonNull } },
  ],
};
