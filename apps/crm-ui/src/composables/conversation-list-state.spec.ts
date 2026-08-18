import { describe, expect, it } from 'vitest';
import { mergeConversationList } from './conversation-list-state';
import type { Conversation } from './use-chat';

function conversation(id: string, sentAt: string, content: string): Conversation {
  return {
    id,
    threadType: 'user',
    contact: { id: `contact-${id}`, fullName: id } as Conversation['contact'],
    zaloAccount: null,
    lastMessageAt: sentAt,
    unreadCount: 0,
    isReplied: false,
    messages: [{ content, contentType: 'text', senderType: 'user', sentAt, isDeleted: false }],
  };
}

describe('mergeConversationList', () => {
  it('preserves contact detail fields while accepting fresh list fields', () => {
    const current = conversation('a', '2026-08-18T01:00:00Z', 'old');
    current.contact = { ...current.contact!, phone: '0900000000', leadScore: 10 };
    const incoming = conversation('a', '2026-08-18T01:01:00Z', 'new');
    incoming.contact = { ...incoming.contact!, leadScore: 20 };

    const result = mergeConversationList([current], [incoming])[0];
    expect(result.contact?.phone).toBe('0900000000');
    expect(result.contact?.leadScore).toBe(20);
    expect(result.messages?.[0].content).toBe('new');
  });

  it('keeps a newer socket preview when an older HTTP response arrives', () => {
    const socket = conversation('a', '2026-08-18T01:02:00Z', 'socket-new');
    const staleHttp = conversation('a', '2026-08-18T01:01:00Z', 'server-old');
    expect(mergeConversationList([socket], [staleHttp])[0].messages?.[0].content).toBe('socket-new');
  });

  it('does not retain removed conversations unless explicitly preserved', () => {
    const current = conversation('a', '2026-08-18T01:00:00Z', 'old');
    expect(mergeConversationList([current], [])).toEqual([]);
    expect(mergeConversationList([current], [], new Set(['a']))).toEqual([current]);
  });
});
