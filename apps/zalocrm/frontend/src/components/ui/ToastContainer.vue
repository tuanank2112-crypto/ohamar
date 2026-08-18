<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<template>
  <Teleport to="body">
    <div class="toast-container">
      <TransitionGroup name="toast">
        <div
          v-for="t in items"
          :key="t.id"
          class="toast"
          :class="t.type"
        >
          <span class="toast-icon">
            <template v-if="t.type === 'success'"><CoolIcon name="Check" :size="14" /></template>
            <template v-else-if="t.type === 'error'"><CoolIcon name="Close_MD" :size="14" /></template>
            <template v-else-if="t.type === 'warning'"><CoolIcon name="Warning" :size="14" /></template>
            <template v-else><CoolIcon name="Info" :size="14" /></template>
          </span>
          <span class="toast-msg" @click="!t.action && dismiss(t.id)">{{ t.message }}</span>
          <button
            v-if="t.action"
            class="toast-action"
            @click="onAction(t)"
          >{{ t.action.label }}</button>
          <button
            class="toast-close"
            title="Đóng"
            @click="dismiss(t.id)"
          ><CoolIcon name="Close_MD" :size="14" /></button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { useToast, type ToastItem } from '@/composables/use-toast';

const { items, dismiss } = useToast();

async function onAction(t: ToastItem) {
  if (!t.action) return;
  try {
    await t.action.handler();
  } catch (err) {
    console.error('[toast-action] handler error', err);
  }
}
</script>

<style scoped>
.toast-container {
  position: fixed;
  top: 20px; right: 20px;
  display: flex; flex-direction: column; gap: 8px;
  z-index: 9999;
  pointer-events: none;
}
.toast {
  background: var(--mc-surface);
  color: var(--mc-ink);
  padding: 12px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
  pointer-events: auto;
  min-width: 280px;
  max-width: 420px;
  border: 1px solid var(--mc-line);
  border-left: 4px solid #9CA3AF;
  word-wrap: break-word;
  display: flex;
  align-items: center;
  gap: 10px;
}
.toast.success { border-color: #BBF7D0; border-left-color: #22C55E; color: var(--mc-success); }
.toast.warning { border-color: #FDE68A; border-left-color: #F59E0B; color: var(--mc-warning); }
.toast.error   { border-color: #FECACA; border-left-color: #EF4444; color: var(--mc-danger); }

.toast-icon { font-size: 16px; flex-shrink: 0; line-height: 1; }
.toast-msg {
  flex: 1;
  cursor: pointer;
  line-height: 1.4;
}
.toast-action {
  background: rgba(59, 130, 246, 0.1);
  color: #aeb7ff;
  border: none;
  padding: 4px 12px;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  flex-shrink: 0;
}
.toast-action:hover { background: rgba(59, 130, 246, 0.2); }
.toast-close {
  background: transparent;
  border: none;
  color: #9CA3AF;
  font-size: 14px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
  flex-shrink: 0;
}
.toast-close:hover { color: var(--mc-muted); }

.toast-enter-active,
.toast-leave-active { transition: all 0.25s ease; }
.toast-enter-from   { opacity: 0; transform: translateY(-10px); }
.toast-leave-to     { opacity: 0; transform: translateX(60%); }
</style>
