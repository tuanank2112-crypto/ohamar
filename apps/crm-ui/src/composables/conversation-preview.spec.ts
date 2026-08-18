import { describe, expect, it } from 'vitest';
import { chooseConversationPreview, latestConversationMessage } from './conversation-preview';

const msg = (id: string, sentAt: string, zaloMsgIdNum: string | null = null) => ({ id, sentAt, zaloMsgIdNum });

describe('conversation preview ordering', () => {
  it('uses sentAt instead of trusting the array order', () => {
    const old = msg('old', '2026-08-18T01:00:00.000Z', '999');
    const latest = msg('latest', '2026-08-18T01:01:00.000Z');
    expect(latestConversationMessage([latest, old])?.id).toBe('latest');
    expect(latestConversationMessage([old, latest])?.id).toBe('latest');
  });

  it('does not demote a newer CRM message just because it has no Zalo echo id', () => {
    const oldZalo = msg('old-zalo', '2026-08-18T01:00:00.000Z', '999999');
    const newCrm = msg('new-crm', '2026-08-18T01:02:00.000Z');
    expect(chooseConversationPreview([oldZalo], [newCrm])?.[0].id).toBe('new-crm');
  });

  it('keeps a socket preview during server lag, then lets equal-time server data reconcile', () => {
    const socket = msg('socket', '2026-08-18T01:02:00.000Z');
    const staleServer = msg('server-old', '2026-08-18T01:01:00.000Z', '10');
    expect(chooseConversationPreview([socket], [staleServer])?.[0].id).toBe('socket');

    const canonical = msg('canonical', socket.sentAt, '11');
    expect(chooseConversationPreview([socket], [canonical])?.[0].id).toBe('canonical');
  });
});
