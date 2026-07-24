<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <div class="cfb" :class="{ 'cfb--topbar': layout === 'topbar' }">
    <!-- 4 tabs row — Main Tab style, chia 4 equal, KHÔNG icon KHÔNG count.
         User spec: "Đây dạng Main Tab — fix size không cần đếm số hội thoại". -->
    <div class="cfb-tabs main-tab-style">
      <button
        v-for="tab in TABS"
        :key="tab.key"
        class="cfb-tab"
        :class="{
          active: filters.state.activeTab === tab.key,
          'has-unread': tab.key === 'other' && priorityHasUnread,
        }"
        @click="setActiveTab(tab.key)"
        :title="tab.tooltip"
      >
        <span class="tab-label">{{ tab.label }}</span>
      </button>
    </div>

    <!-- Mini counter + sort row — half height, muted -->
    <div class="cfb-mini">
      <span class="mini-count">
        <strong>{{ totalCount }}</strong> hội thoại
        <template v-if="counts.unread">
          <span class="dot">·</span>
          <span class="accent">{{ counts.unread }} chưa đọc</span>
        </template>
      </span>
      <button class="mini-sort" @click="toggleSort">
        {{ filters.state.sortMode === 'unread-first' ? 'Chưa đọc lên trên' : 'Mới nhất lên trên' }}
        <CoolIcon name="Chevron_Down" :size="14" class="ic" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  filters: any;
  totalCount: number;
  counts: {
    unread?: number;
    unanswered?: number;
    stuck?: number;
    ready?: number;
    individual?: number;
    group?: number;
    main?: number;
    other?: number;
  };
  /** 2026-06-11 — tab Ưu tiên KHÔNG hiện số đếm, nhưng IN ĐẬM hơn khi có hội thoại
   *  chưa đọc trong tab này. Đọc hết → hết đậm. ChatView truyền cờ này xuống. */
  priorityHasUnread?: boolean;
  layout?: 'stacked' | 'topbar';
}>(), {
  layout: 'stacked',
});

// 2026-06-20: phát khi click LẠI tab đang active → ChatView clear ô tìm kiếm.
const emit = defineEmits<{ 'reselect-tab': [] }>();

type TabKey = 'personal' | 'group' | 'main' | 'other';

const TABS: Array<{
  key: TabKey;
  label: string;
  tooltip: string;
}> = [
  { key: 'main',     label: 'Tất cả',  tooltip: 'Tất cả hội thoại chính của nick đang xem' },
  { key: 'personal', label: 'Cá nhân', tooltip: 'Chỉ hội thoại 1-1 (user với user)' },
  { key: 'group',    label: 'Nhóm',    tooltip: 'Chỉ hội thoại nhóm' },
  // 2026-06-11 — đổi "Khác" → "Ưu tiên" (key 'other' giữ nguyên, load-bearing
  // ở use-inbox-filters + PATCH /:id/tab). Hội thoại chuyển vào đây sẽ KHÔNG còn
  // ở tab Cá nhân nữa (loại trừ lẫn nhau, xử lý ở backend).
  { key: 'other',    label: 'Ưu tiên', tooltip: 'Hội thoại ưu tiên (đã ghim từ menu chuột phải)' },
];

function setActiveTab(key: TabKey) {
  // 2026-06-20 (anh báo): click LẠI tab đang active cũng phải clear ô tìm kiếm. activeTab
  // không đổi → watch ở ChatView không fire → emit 'reselect-tab' để parent tự clear search.
  const sameTab = props.filters.state.activeTab === key;
  // Single-active: tab khác sẽ tự deselect.
  props.filters.state.activeTab = key;
  if (sameTab) emit('reselect-tab');
}

function toggleSort() {
  props.filters.setSortMode(
    props.filters.state.sortMode === 'unread-first' ? 'recent' : 'unread-first'
  );
}
</script>

<style scoped>
.cfb {
  margin-top: 10px;
  background: transparent;
  border-bottom: 0;
  flex-shrink: 0;
}
.cfb--topbar {
  display: grid;
  grid-template-columns: minmax(420px, 1fr) minmax(210px, auto);
  align-items: center;
  gap: 10px;
  width: 100%;
  margin-top: 0;
}

/* Main Tab style — 4 tabs prominent, fix size, KHÔNG count */
.cfb-tabs.main-tab-style {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  padding: 4px;
  margin: 0;
  background: var(--mc-surface);
  border: 1px solid var(--mc-line);
  border-radius: var(--mc-radius-lg);
  gap: 3px;
  border-bottom: 1px solid var(--mc-line);
}
.cfb-tabs.main-tab-style .cfb-tab {
  min-height: 38px;
  padding: 7px 4px;
  text-align: center;
  /* 2026-06-11 — "Ưu tiên" (7 ký tự) dài hơn "Khác"; giảm font + padding để 4 tab
     đều không bị cắt chữ ở 1366px. */
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0;
  color: var(--mc-muted);
  cursor: pointer;
  border: none;
  background: transparent;
  border-radius: var(--mc-radius-sm);
  transition: background-color 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  overflow: hidden;
  font-family: inherit;
}
.cfb-tabs.main-tab-style .cfb-tab:hover {
  background: rgba(255,255,255,.045);
  color: #c5caff;
}
.cfb-tabs.main-tab-style .cfb-tab.active {
  background: linear-gradient(135deg, rgba(108,125,232,.24), rgba(139,92,246,.16));
  color: #d9ddff;
  box-shadow: inset 0 0 0 1px rgba(108,125,232,.32);
}
/* 2026-06-11 — tab Ưu tiên có tin chưa đọc: in ĐẬM hơn + đậm màu + chấm báo nhỏ.
   Không hiện con số (theo yêu cầu). Đọc hết → class này biến mất → trở lại thường. */
.cfb-tabs.main-tab-style .cfb-tab.has-unread:not(.active) {
  color: var(--mc-ink);
  font-weight: 800;
}
.cfb-tabs.main-tab-style .cfb-tab.has-unread .tab-label::after {
  content: '';
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-left: 5px;
  border-radius: 50%;
  background: #EF4444;
  vertical-align: middle;
}
.cfb-tab .tab-label {
  overflow: hidden;
  text-overflow: ellipsis;
}
/* Main-tab: font đã đủ nhỏ để "Ưu tiên" vừa khít → không cắt ellipsis. */
.cfb-tabs.main-tab-style .cfb-tab .tab-label {
  overflow: visible;
  text-overflow: clip;
}
/* Bottom border thay cho tabs section sau khi đổi sang main-tab pill style */
.cfb-tabs.main-tab-style + .cfb-mini {
  margin-top: 8px;
}
.cfb--topbar .cfb-tabs.main-tab-style {
  margin: 0;
}
.cfb--topbar .cfb-tabs.main-tab-style + .cfb-mini {
  margin-top: 0;
}

/* ④ Mini row — half height, muted */
.cfb-mini {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 2px;
  background: transparent;
  font-size: 10.5px;
  color: var(--mc-muted);
  border-bottom: 0;
  min-height: 24px;
}
.cfb--topbar .cfb-mini {
  justify-content: flex-end;
  gap: 12px;
  min-height: 38px;
  padding: 0;
  white-space: nowrap;
}
.mini-count strong { color: var(--mc-ink); font-weight: 600; }
.mini-count .dot { margin: 0 4px; color: var(--mc-line); }
.mini-count .accent { color: #EF4444; font-weight: 600; }
.mini-sort {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  cursor: pointer;
  padding: 3px 7px;
  border-radius: var(--mc-radius-sm);
  background: transparent;
  border: none;
  color: var(--mc-muted);
  font-weight: 500;
  font-size: 10.5px;
  font-family: inherit;
  transition: color 0.15s, background 0.15s;
}
.mini-sort:hover { color: #c5caff; background: var(--mc-surface-alt); }
.mini-sort .ic { width: 10px; height: 10px; opacity: 0.7; }

@media (max-width: 1280px) {
  .cfb--topbar {
    grid-template-columns: minmax(0, 1fr);
  }
  .cfb--topbar .cfb-mini {
    justify-content: space-between;
    min-height: 24px;
  }
}

@media (max-width: 960px) {
  .cfb--topbar {
    grid-template-columns: 1fr;
  }
}
</style>
