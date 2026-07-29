// SPDX-License-Identifier: AGPL-3.0-or-later
import { zaloPool } from './zalo-pool.js';
import { zaloOps } from '../../shared/zalo-operations.js';
import type { ZaloCredentials } from './session-credentials.js';

export interface ZaloGateway {
  connect(accountId: string, credentials: ZaloCredentials, proxyUrl?: string | null): Promise<void>;
  disconnect(accountId: string): void;
  status(accountId: string): string;
  sendText(accountId: string, threadId: string, threadType: 0 | 1, text: string): Promise<unknown>;
}

class InProcessZaloGateway implements ZaloGateway {
  connect(accountId: string, credentials: ZaloCredentials, proxyUrl?: string | null) { return zaloPool.reconnect(accountId, credentials, proxyUrl); }
  disconnect(accountId: string) { zaloPool.disconnect(accountId); }
  status(accountId: string) { return zaloPool.getStatus(accountId); }
  sendText(accountId: string, threadId: string, threadType: 0 | 1, text: string) {
    return zaloOps.sendMessage(accountId, threadId, threadType, { msg: text });
  }
}

export const zaloGateway: ZaloGateway = new InProcessZaloGateway();
