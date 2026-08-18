import type { Conversation } from '@/composables/use-chat';
import { chooseConversationPreview } from '@/composables/conversation-preview';

function mergeContactPreserveDetail<T extends { id?: string } | null | undefined>(existing: T, incoming: T): T {
  if (!incoming) return incoming;
  if (!existing || existing.id !== incoming.id) return incoming;
  return { ...existing, ...incoming } as T;
}

export function mergeConversationList(
  existing: Conversation[], incoming: Conversation[], preserveIds?: Set<string>,
): Conversation[] {
  const existingMap = new Map(existing.map(conversation => [conversation.id, conversation]));
  const incomingIds = new Set(incoming.map(conversation => conversation.id));
  const merged = incoming.map(conversation => {
    const previous = existingMap.get(conversation.id);
    if (!previous) return conversation;
    return {
      ...conversation,
      contact: mergeContactPreserveDetail(previous.contact, conversation.contact),
      messages: chooseConversationPreview(previous.messages, conversation.messages),
    };
  });
  if (preserveIds) {
    for (const id of preserveIds) {
      if (!incomingIds.has(id)) {
        const preserved = existingMap.get(id);
        if (preserved) merged.push(preserved);
      }
    }
  }
  return merged;
}
