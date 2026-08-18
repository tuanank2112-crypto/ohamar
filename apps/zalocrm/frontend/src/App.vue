<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<template>
  <component :is="layout">
    <router-view v-slot="{ Component, route: viewRoute }">
      <McRouteMotion :disabled="route.path.startsWith('/chat')">
        <component :is="Component" :key="viewRoute.fullPath" />
      </McRouteMotion>
    </router-view>
  </component>
  <!-- Hộp xác nhận dùng chung, thay window.confirm trên toàn ứng dụng. -->
  <ConfirmHost />
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import AuthLayout from '@/layouts/AuthLayout.vue';
import MonarchLayout from '@/layouts/MonarchLayout.vue';
import ConfirmHost from '@/components/ui/ConfirmHost.vue';
import McRouteMotion from '@/components/ui/McRouteMotion.vue';
import { useAuthStore } from '@/stores/auth';
import { usePrivacyStore } from '@/stores/privacy';
import { useTheme } from 'vuetify';

const route = useRoute();
const auth = useAuthStore();
const privacy = usePrivacyStore();
const theme = useTheme();
theme.change('monarchDark');

const layout = computed(() => {
  const name = (route.meta?.layout as string) || 'default';
  if (name === 'auth') return AuthLayout;
  return MonarchLayout;
});

// Anh chốt 2026-05-22: sau F5 refresh, gọi privacyStore.fetchStatus() để rebuild
// isUnlocked + expiresAt từ HttpOnly cookie. Trước fix: cookie vẫn còn ở browser
// nhưng FE state mặc định isUnlocked=false → bubble blur vẫn hiện → click → bắt
// nhập PIN lại dù session vẫn alive.
watch(
  () => auth.user?.id,
  (uid) => { if (uid) privacy.fetchStatus(true).catch(() => {}); },
  { immediate: true },
);
</script>
