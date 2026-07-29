// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { ref, computed, watch } from 'vue';

interface PendingMessage {
  id: string;
  conversationId: string;
  content: string;
  createdAt: string;
}

const STORAGE_KEY = 'zalocrm-offline-queue';

function isValidMessage(item: unknown): item is PendingMessage {
  if (!item || typeof item !== 'object') return false;
  const obj = item as Record<string, unknown>;
  return typeof obj.id === 'string'
    && typeof obj.conversationId === 'string'
    && typeof obj.content === 'string'
    && typeof obj.createdAt === 'string';
}

function loadQueue(): PendingMessage[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidMessage);
  } catch {
    return [];
  }
}

function saveQueue(queue: PendingMessage[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

const pendingMessages = ref<PendingMessage[]>(loadQueue());
let flushing = false;

watch(pendingMessages, (val) => saveQueue(val), { deep: true });

export function useOfflineQueue() {
  function enqueue(conversationId: string, content: string) {
    pendingMessages.value.push({
      id: `offline-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      conversationId,
      content,
      createdAt: new Date().toISOString(),
    });
  }

  async function flush(sendFn: (conversationId: string, content: string) => Promise<void>) {
    if (flushing) return;
    flushing = true;
    try {
      // FIX U-08 (2026-07-07): Use while loop to process queue with delay on failure
      // instead of breaking entirely, avoiding tight infinite loops.
      while (pendingMessages.value.length > 0) {
        const msg = pendingMessages.value[0];
        try {
          await sendFn(msg.conversationId, msg.content);
          pendingMessages.value = pendingMessages.value.filter(m => m.id !== msg.id);
        } catch {
          await new Promise(r => setTimeout(r, 5000)); // 5s delay before retry
        }
      }
    } finally {
      flushing = false;
    }
  }

  const pendingCount = computed(() => pendingMessages.value.length);

  return { pendingMessages, pendingCount, enqueue, flush };
}
