import { describe, expect, it } from 'vitest';
import { mergeConversationList } from './conversation-list-state';
import type { Conversation } from './use-chat';

function conversation(id: string, sentAt: string, content: string): Conversation {
  return {
    id, threadType: 'user',
    contact: { id: `contact-${id}`, fullName: id } as Conversation['contact'],
    zaloAccount: null, lastMessageAt: sentAt, unreadCount: 0, isReplied: false,
    messages: [{ content, contentType: 'text', senderType: 'user', sentAt, isDeleted: false }],
  };
}

describe('mergeConversationList', () => {
  it('preserves detail and accepts newer server preview', () => {
    const current = conversation('a', '2026-08-18T01:00:00Z', 'old');
    current.contact = { ...current.contact!, phone: '0900000000' };
    const incoming = conversation('a', '2026-08-18T01:01:00Z', 'new');
    const result = mergeConversationList([current], [incoming])[0];
    expect(result.contact?.phone).toBe('0900000000');
    expect(result.messages?.[0].content).toBe('new');
  });

  it('keeps newer socket preview and only preserves explicit ids', () => {
    const socket = conversation('a', '2026-08-18T01:02:00Z', 'socket-new');
    const stale = conversation('a', '2026-08-18T01:01:00Z', 'server-old');
    expect(mergeConversationList([socket], [stale])[0].messages?.[0].content).toBe('socket-new');
    expect(mergeConversationList([socket], [])).toEqual([]);
    expect(mergeConversationList([socket], [], new Set(['a']))).toEqual([socket]);
  });
});
