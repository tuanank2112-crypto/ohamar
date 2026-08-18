<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<template>
  <!-- 2026-06-09 (anh báo menu bar kẹt): v-model để đóng chủ động khi click thông báo
       → điều hướng. Trước đây close-on-content-click=false + không đóng trong handleClick
       làm menu (z-index 2000) kẹt mở phủ nav, nuốt click. -->
  <v-menu v-model="bellMenu" offset-y :close-on-content-click="false" max-width="380">
    <template #activator="{ props: menuProps }">
      <v-btn icon variant="text" v-bind="menuProps" class="notification-button mr-1">
        <v-icon class="notification-icon">mdi-bell-outline</v-icon>
        <span v-if="notifications.length > 0" class="notification-count">
          {{ notifications.length > 99 ? '99+' : notifications.length }}
        </span>
      </v-btn>
    </template>
    <v-card style="max-height: 400px; overflow-y: auto;">
      <v-card-title class="text-body-1 font-weight-bold pa-3">Thông báo</v-card-title>
      <v-divider />
      <v-list density="compact" v-if="notifications.length > 0">
        <v-list-item
          v-for="n in notifications"
          :key="n.id"
          @click="handleClick(n)"
          class="py-2"
        >
          <template #prepend>
            <v-icon
              :color="n.type === 'error' ? 'red' : n.type === 'warning' ? 'orange' : 'blue'"
              size="20"
            >
              {{ n.type === 'error' ? 'mdi-alert-circle' : n.type === 'warning' ? 'mdi-alert' : 'mdi-information' }}
            </v-icon>
          </template>
          <v-list-item-title class="text-body-2">{{ n.title }}</v-list-item-title>
          <v-list-item-subtitle class="text-caption">{{ n.detail }}</v-list-item-subtitle>
        </v-list-item>
      </v-list>
      <div v-else-if="error" class="pa-4 text-center text-caption text-error">{{ error }}</div> <!-- FIX U-07 -->
      <div v-else class="pa-4 text-center text-caption text-grey">Không có thông báo</div>
    </v-card>
  </v-menu>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/api/index';

interface Notification {
  id: string;
  type: string;
  title: string;
  detail: string;
  priority: string;
}

const notifications = ref<Notification[]>([]);
const error = ref<string | null>(null); // FIX U-07
const router = useRouter();
const bellMenu = ref(false); // 2026-06-09 — điều khiển đóng menu chủ động
let interval: ReturnType<typeof setInterval>;

async function fetchNotifications() {
  try {
    error.value = null; // FIX U-07
    const res = await api.get('/notifications');
    notifications.value = res.data.notifications || [];
  } catch (err: any) {
    // FIX U-07 (2026-07-07): Do not swallow error
    error.value = err?.response?.data?.error || err.message || 'Lỗi tải thông báo';
  }
}

function handleClick(n: Notification) {
  bellMenu.value = false; // đóng menu TRƯỚC khi điều hướng → tránh overlay kẹt phủ nav
  if (n.id === 'unreplied') router.push('/chat');
  else if (n.id.startsWith('apt-')) router.push('/appointments');
  else if (n.id.startsWith('zalo-')) router.push('/zalo-accounts');
  else if (n.id === 'tmr-apts') router.push('/appointments');
}

onMounted(() => {
  fetchNotifications();
  interval = setInterval(fetchNotifications, 60000);
});

onUnmounted(() => clearInterval(interval));
</script>

<style scoped>
.notification-button {
  position: relative;
  overflow: visible;
}

.notification-icon {
  color: var(--mc-muted);
}

.notification-count {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border: 2px solid var(--mc-surface);
  border-radius: 999px;
  background: #ff6b70;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  pointer-events: none;
}
</style>
