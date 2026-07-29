<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <div class="smr-row">
    <div class="smr-label">
      <CoolIcon :name="icon" :size="15" class="smr-icon" />
      <span>{{ label }}</span>
    </div>
    <div class="smr-content">
      <div v-if="name" class="smr-name">
        {{ name }}
        <span v-if="extraPill" class="smr-key">{{ extraPill }}</span>
      </div>
      <div v-if="id" class="smr-id">
        ID: <code>{{ id }}</code>
        <button v-if="id" class="smr-copy" :title="'Copy ' + id" @click="copyId">📋</button>
      </div>
      <div v-if="extra" class="smr-extra">{{ extra }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useToast } from '@/composables/use-toast';
const props = defineProps<{
  icon: string;
  label: string;
  name?: string | null;
  id?: string | null;
  extra?: string | null;
  extraPill?: string | null;
}>();
const toast = useToast();
async function copyId() {
  if (!props.id) return;
  try { await navigator.clipboard.writeText(props.id); toast.success('Đã copy ID'); }
  catch { toast.error('Không copy được'); }
}
</script>

<style scoped>
.smr-row {
  display: flex; padding: 6px 0;
  border-bottom: 1px dashed #BAE6FD;
}
.smr-row:last-child { border-bottom: none; }
.smr-label {
  width: 130px;
  display: flex; gap: 6px; align-items: flex-start;
  font-size: 11.5px; color: #aeb7ff; font-weight: 600;
}
.smr-icon { font-size: 12px; }
.smr-content { flex: 1; min-width: 0; font-size: 12.5px; }
.smr-name { font-weight: 600; color: #aeb7ff; word-break: break-word; }
.smr-key {
  display: inline-block;
  background: rgba(251,191,36,.14); color: var(--mc-warning);
  padding: 1px 6px; border-radius: 4px;
  font-family: monospace; font-size: 11px; font-weight: 700;
  margin-left: 4px;
  border: 1px dashed #FCD34D;
}
.smr-id {
  font-size: 10.5px; color: var(--mc-muted);
  font-family: monospace; margin-top: 2px;
  display: flex; gap: 6px; align-items: center;
}
.smr-id code {
  background: rgba(108,125,232,.14);
  padding: 1px 4px;
  border-radius: 3px;
  color: #aeb7ff;
}
.smr-copy {
  background: transparent; border: none; cursor: pointer;
  font-size: 11px;
  padding: 0 4px;
  border-radius: 3px;
  color: var(--mc-muted);
}
.smr-copy:hover { background: #BAE6FD; color: #aeb7ff; }
.smr-extra {
  font-size: 11px; color: var(--mc-muted); margin-top: 2px;
  font-style: italic;
}
</style>
