<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <div v-if="count > 0" class="bulk-bar">
    <span class="count">{{ count }}</span>
    <span>đã chọn</span>
    <!-- Nhắn/Gắn tag/Đổi trạng thái hàng loạt cần backend bulk (EE) — ẩn ở CE
         thay vì hiện nút "đang phát triển". Xuất CSV chạy client-side, luôn hiện. -->
    <template v-if="advanced">
      <button @click="$emit('msg-batch')"><CoolIcon name="Chat" :size="14" /> Nhắn hàng loạt</button>
      <button @click="$emit('tag')"><CoolIcon name="Tag" :size="14" /> Gắn tag</button>
      <button @click="$emit('change-status')"><CoolIcon name="Calendar" :size="14" /> Đổi trạng thái</button>
    </template>
    <button @click="$emit('export')"><CoolIcon name="Download" :size="14" /> Xuất</button>
    <span class="clear" @click="$emit('clear')"><CoolIcon name="Close_MD" :size="14" /> Bỏ chọn</span>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  count: number;
  advanced?: boolean;
}>();

defineEmits<{
  (e: 'msg-batch'): void;
  (e: 'tag'): void;
  (e: 'change-status'): void;
  (e: 'export'): void;
  (e: 'clear'): void;
}>();
</script>

<style scoped>
.bulk-bar {
  padding: 8px 20px;
  background: var(--brand);
  color: #fff;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  animation: slideDown .15s ease;
}
@keyframes slideDown {
  from { transform: translateY(-100%); opacity: 0; }
  to   { transform: translateY(0); opacity: 1; }
}
.bulk-bar .count { font-weight: 700; }
.bulk-bar button {
  background: rgba(255,255,255,.12);
  border: 1px solid rgba(255,255,255,.2);
  color: #fff;
  padding: 4px 10px;
  border-radius: 5px;
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
}
.bulk-bar button:hover { background: rgba(255,255,255,.2); }
.bulk-bar .clear {
  margin-left: auto;
  cursor: pointer;
  opacity: .8;
  user-select: none;
}
.bulk-bar .clear:hover { opacity: 1; }
</style>
