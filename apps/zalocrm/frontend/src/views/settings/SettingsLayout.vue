<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<template>
  <div class="settings-layout">
    <!-- Sidebar -->
    <aside class="sl-sidebar" aria-label="Cài đặt sidebar">
      <header class="sl-header">
        <h1 class="sl-title">
          <v-icon class="sl-icon" icon="mdi-cog-outline" size="20" />
          <span>Cài đặt</span>
        </h1>
      </header>

      <div class="sl-search">
        <v-icon class="ic" icon="mdi-magnify" size="16" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Tìm cài đặt..."
          aria-label="Tìm cài đặt"
        />
        <button v-if="searchQuery" type="button" class="sl-search-clear" @click="searchQuery = ''" aria-label="Xoá tìm kiếm"><CoolIcon name="Close_MD" :size="14" /></button>
      </div>

      <nav class="sl-nav" :aria-label="searchQuery ? 'Kết quả tìm kiếm' : 'Cài đặt'">
        <!-- Search results -->
        <div v-if="searchQuery" class="sl-search-results">
          <div v-if="searchResults.length === 0" class="sl-empty">
            Không tìm thấy "{{ searchQuery }}"
          </div>
          <RouterLink
            v-for="item in searchResults"
            :key="`sr-${item.route}`"
            :to="item.route"
            class="sl-item"
            :class="{ active: isItemActive(item.route) }"
          >
            <v-icon class="sl-item-icon" :icon="item.icon" size="18" />
            <span class="sl-item-label">{{ item.label }}</span>
            <span v-if="item.comingSoon" class="sl-lock" title="Sắp ra mắt"><CoolIcon name="Lock" :size="14" /></span>
          </RouterLink>
        </div>

        <!-- Grouped nav -->
        <div v-else>
          <div v-for="group in visibleGroups" :key="group.id" class="sl-group">
            <button
              type="button"
              class="sl-group-header"
              :class="{ collapsed: !openGroups[group.id] }"
              @click="toggleGroup(group.id)"
            >
              <v-icon class="sl-group-icon" :icon="group.icon" size="17" />
              <span class="sl-group-label">{{ group.label }}</span>
              <span class="sl-chevron">▾</span>
            </button>
            <div v-if="openGroups[group.id]" class="sl-group-body">
              <RouterLink
                v-for="item in group.items"
                :key="item.route"
                :to="item.route"
                class="sl-item"
                :class="{ active: isItemActive(item.route) }"
              >
                <v-icon class="sl-item-icon" :icon="item.icon" size="18" />
                <span class="sl-item-label">{{ item.label }}</span>
                <span v-if="item.comingSoon" class="sl-lock" title="Sắp ra mắt"><CoolIcon name="Lock" :size="14" /></span>
              </RouterLink>
            </div>
          </div>
        </div>
      </nav>
    </aside>

    <!-- Content panel -->
    <main class="sl-content" role="main">
      <header class="sl-breadcrumb" v-if="activeItem">
        <RouterLink to="/settings" class="bc-root">Cài đặt</RouterLink>
        <span class="bc-sep">/</span>
        <span class="bc-group">{{ activeItem.group.label }}</span>
        <span class="bc-sep">/</span>
        <span class="bc-current">{{ activeItem.item.label }}</span>
      </header>
      <div class="sl-content-body">
        <RouterView />
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useSettingsNav } from '@/composables/use-settings-nav';

const route = useRoute();
const router = useRouter();
const { visibleGroups, activeItem, searchItems, defaultRoute } = useSettingsNav();

// Active class check — support query param (vd /settings/channels/zalo?tab=internal-contact
// active KHÁC /settings/channels/zalo plain — 2 entry trỏ cùng path nhưng tab khác).
function isItemActive(itemRoute: string): boolean {
  const [itemPath, itemQuery] = itemRoute.split('?');
  if (itemPath !== route.path) return false;
  if (!itemQuery) {
    // Item không query → active chỉ khi current cũng không match query của entry khác
    const currentTab = route.query.tab as string | undefined;
    return !currentTab;
  }
  const expected = new URLSearchParams(itemQuery).get('tab');
  return expected === (route.query.tab as string | undefined);
}

const searchQuery = ref('');

// Group collapsed state — persist in localStorage
const SECTION_KEY_PREFIX = 'settings-nav.group.';
function loadGroupState(): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const g of visibleGroups.value) {
    const raw = localStorage.getItem(SECTION_KEY_PREFIX + g.id);
    // Default open = true, except 'dev' which defaults closed for cleaner first impression
    const defaultOpen = g.id !== 'dev';
    result[g.id] = raw === null ? defaultOpen : raw === '1';
  }
  return result;
}
const openGroups = reactive<Record<string, boolean>>(loadGroupState());

function toggleGroup(id: string) {
  openGroups[id] = !openGroups[id];
  localStorage.setItem(SECTION_KEY_PREFIX + id, openGroups[id] ? '1' : '0');
}

// Auto-open group of active item
watch(activeItem, (info) => {
  if (info) openGroups[info.group.id] = true;
}, { immediate: true });

// Re-init openGroups when visibleGroups changes (e.g., role loads after login)
watch(visibleGroups, (groups) => {
  for (const g of groups) {
    if (!(g.id in openGroups)) {
      const raw = localStorage.getItem(SECTION_KEY_PREFIX + g.id);
      const defaultOpen = g.id !== 'dev';
      openGroups[g.id] = raw === null ? defaultOpen : raw === '1';
    }
  }
});

const searchResults = computed(() => searchItems(searchQuery.value));

// Redirect /settings (no subroute) to default item
onMounted(() => {
  if (route.path === '/settings' || route.path === '/settings/') {
    router.replace(defaultRoute.value);
  }
});
</script>

<style scoped>
.settings-layout {
  display: grid;
  grid-template-columns: 260px 1fr;
  height: calc(100vh - 56px);
  background: var(--mc-surface-alt);
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 13.5px;
  color: var(--mc-ink);
  -webkit-font-smoothing: antialiased;
  letter-spacing: -0.005em;
}

/* ── Sidebar ── */
.sl-sidebar {
  background: var(--mc-surface);
  border-right: 1px solid var(--mc-line);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sl-header {
  padding: 16px 18px 12px;
  border-bottom: 1px solid var(--mc-line);
  flex-shrink: 0;
}
.sl-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 700;
  color: var(--mc-ink);
  margin: 0;
}
.sl-icon {
  font-size: 16px;
}

.sl-search {
  padding: 10px 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid var(--mc-line);
  background: var(--mc-surface);
  flex-shrink: 0;
}
.sl-search input {
  flex: 1;
  border: none;
  outline: none;
  background: var(--mc-surface-alt);
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 12.5px;
  font-family: inherit;
  color: var(--mc-ink);
  min-width: 0;
  border: 1px solid transparent;
}
.sl-search input:focus {
  background: var(--mc-surface);
  border-color: #aeb7ff;
  box-shadow: 0 0 0 2px rgba(94, 106, 210, 0.12);
}
.sl-search .ic {
  color: var(--mc-muted);
  font-size: 13px;
}
.sl-search-clear {
  background: transparent;
  border: none;
  color: var(--mc-muted);
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
  font-family: inherit;
  font-size: 10px;
}
.sl-search-clear:hover { color: #EF4444; background: rgba(248,113,113,.14); }

.sl-nav {
  flex: 1;
  overflow-y: auto;
  padding: 8px 6px 16px;
}
.sl-nav::-webkit-scrollbar { width: 5px; }
.sl-nav::-webkit-scrollbar-thumb { background: var(--mc-line); border-radius: 2px; }

.sl-group {
  margin-bottom: 4px;
}
.sl-group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  user-select: none;
}
.sl-group-header:hover { background: var(--mc-surface-alt); }
.sl-group-icon {
  font-size: 13px;
  flex-shrink: 0;
}
.sl-group-label {
  flex: 1;
  font-size: 11px;
  font-weight: 700;
  color: var(--mc-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.sl-chevron {
  color: var(--mc-muted);
  font-size: 10px;
  transition: transform 0.15s;
}
.sl-group-header.collapsed .sl-chevron {
  transform: rotate(-90deg);
}

.sl-group-body {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 2px 0 6px 8px;
}
.sl-search-results {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sl-item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 10px;
  border-radius: 6px;
  text-decoration: none;
  color: var(--mc-ink);
  font-size: 12.5px;
  font-weight: 500;
  transition: all 0.12s;
}
.sl-item:hover {
  background: var(--mc-surface-alt);
}
/* Chỉ dùng .active từ isItemActive() — KHÔNG dựa router-link-*-active mặc định
   (nó bỏ qua query nên 2 item cùng path /settings/channels/zalo với ?tab khác
   nhau đều sáng cùng lúc). 2026-07-13 fix double-highlight. */
.sl-item.active {
  background: rgba(108,125,232,.14);
  color: #aeb7ff;
  font-weight: 600;
  box-shadow: inset 3px 0 0 #5E6AD2;
}
.sl-item-icon {
  font-size: 14px;
  flex-shrink: 0;
}
.sl-item-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sl-lock {
  font-size: 11px;
  opacity: 0.6;
  flex-shrink: 0;
}
.sl-empty {
  padding: 20px 14px;
  font-size: 12px;
  color: var(--mc-muted);
  text-align: center;
  font-style: italic;
}

/* ── Content ── */
.sl-content {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--mc-surface-alt);
}
.sl-breadcrumb {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  font-size: 12px;
  color: var(--mc-muted);
  background: var(--mc-surface);
  border-bottom: 1px solid var(--mc-line);
  flex-shrink: 0;
}
.bc-root {
  color: #aeb7ff;
  text-decoration: none;
  font-weight: 500;
}
.bc-root:hover { text-decoration: underline; }
.bc-sep {
  color: var(--mc-line);
}
.bc-group {
  color: var(--mc-muted);
}
.bc-current {
  color: var(--mc-ink);
  font-weight: 600;
}
.sl-content-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px 32px;
}
.sl-content-body::-webkit-scrollbar { width: 8px; }
.sl-content-body::-webkit-scrollbar-thumb { background: var(--mc-line); border-radius: 4px; }
</style>
