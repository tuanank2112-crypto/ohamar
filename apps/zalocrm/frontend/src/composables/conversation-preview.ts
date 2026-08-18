export interface ConversationPreviewMessage {
  id?: string;
  sentAt: string;
  zaloMsgIdNum?: string | null;
}

function messageTime(message: ConversationPreviewMessage): number {
  const value = new Date(message.sentAt).getTime();
  return Number.isFinite(value) ? value : 0;
}

/** Return the newest message regardless of the array order returned by a cache/API. */
export function latestConversationMessage<T extends ConversationPreviewMessage>(
  messages?: T[] | null,
): T | undefined {
  if (!messages?.length) return undefined;
  return messages.reduce((latest, candidate) => {
    const timeDiff = messageTime(candidate) - messageTime(latest);
    if (timeDiff !== 0) return timeDiff > 0 ? candidate : latest;
    if (candidate.zaloMsgIdNum && latest.zaloMsgIdNum) {
      return BigInt(candidate.zaloMsgIdNum) > BigInt(latest.zaloMsgIdNum) ? candidate : latest;
    }
    return candidate;
  });
}

export function chooseConversationPreview<T extends ConversationPreviewMessage>(
  existing?: T[] | null,
  incoming?: T[] | null,
): T[] | undefined {
  const previous = latestConversationMessage(existing);
  const fresh = latestConversationMessage(incoming);
  if (!previous) return incoming ?? undefined;
  if (!fresh) return [previous];
  return messageTime(previous) > messageTime(fresh) ? [previous] : [fresh];
}
