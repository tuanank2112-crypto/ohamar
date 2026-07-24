<template>
  <v-app class="monarch-ui mc-app-shell">
    <div v-if="mobileOpen" class="mc-sidebar-backdrop" @click="mobileOpen = false" />

    <aside ref="sidebarEl" class="mc-sidebar" :class="{ collapsed, 'mobile-open': mobileOpen }">
      <div class="mc-sidebar__brand">
        <RouterLink to="/" class="mc-brand-link" aria-label="Monarch CRM">
          <McBrandMark :compact="collapsed" />
        </RouterLink>
        <button class="mc-sidebar__toggle" :aria-label="collapsed ? 'Mở rộng menu' : 'Thu gọn menu'" @click="toggleSidebar">
          <PanelLeftOpen v-if="collapsed" :size="17" />
          <PanelLeftClose v-else :size="17" />
        </button>
      </div>

      <div v-if="!collapsed && orgName" class="mc-org-badge">
        <div class="mc-org-badge__avatar">{{ orgInitial }}</div>
        <div><span>Không gian làm việc</span><strong>{{ orgName }}</strong></div>
      </div>

      <nav class="mc-nav" aria-label="Điều hướng chính">
        <section v-for="group in visibleGroups" :key="group.title" class="mc-nav-group">
          <div v-if="!collapsed" class="mc-nav-group__title">{{ group.title }}</div>
          <RouterLink
            v-for="item in group.items"
            :key="item.path"
            :to="item.path"
            class="mc-nav-item"
            :class="{ active: isActive(item.path) }"
            :title="collapsed ? item.label : undefined"
            @click="mobileOpen = false"
          >
            <component :is="item.icon" :size="18" :stroke-width="1.9" />
            <span v-if="!collapsed">{{ item.label }}</span>
          </RouterLink>
        </section>
      </nav>

      <div class="mc-sidebar__footer">
        <div class="mc-user-card" :class="{ compact: collapsed }">
          <Avatar :src="auth.user?.avatarUrl" :name="auth.user?.fullName || 'U'" :size="32" :platform="null" />
          <div v-if="!collapsed" class="mc-user-card__copy">
            <strong>{{ auth.user?.fullName || 'Tài khoản' }}</strong>
            <span>{{ roleLabel }}</span>
          </div>
          <v-menu v-if="!collapsed" location="top end">
            <template #activator="{ props }">
              <button class="mc-icon-button" v-bind="props" aria-label="Mở menu tài khoản"><MoreHorizontal :size="17" /></button>
            </template>
            <v-list density="compact" min-width="210">
              <v-list-item to="/settings/personal/profile" title="Tài khoản của tôi" prepend-icon="mdi-account-outline" />
              <v-list-item title="Đăng xuất" prepend-icon="mdi-logout" @click="logout" />
            </v-list>
          </v-menu>
        </div>
      </div>
    </aside>

    <div class="mc-workspace" :class="{ 'sidebar-collapsed': collapsed }">
      <header ref="topbarEl" class="mc-topbar">
        <button class="mc-mobile-menu" aria-label="Mở menu" @click="mobileOpen = true"><Menu :size="20" /></button>
        <div class="mc-topbar__context">
          <span>{{ sectionLabel }}</span>
          <strong>{{ pageTitle }}</strong>
        </div>
        <div class="mc-topbar__spacer" />
        <GlobalSearch class="mc-global-search" />
        <NotificationBell class="mc-notifications" />
        <RouterLink to="/settings/personal/profile" class="mc-topbar__avatar" :title="auth.user?.fullName || 'Tài khoản'">
          <Avatar :src="auth.user?.avatarUrl" :name="auth.user?.fullName || 'U'" :size="32" :platform="null" />
        </RouterLink>
      </header>

      <v-main class="mc-main">
        <div class="mc-page-stage" :class="{ 'mc-page-stage--chat': route.path.startsWith('/chat') }">
          <slot />
        </div>
      </v-main>
    </div>

    <nav class="mc-mobile-nav" aria-label="Điều hướng mobile">
      <RouterLink v-for="item in mobileItems" :key="item.path" :to="item.path" :class="{ active: isActive(item.path) }">
        <component :is="item.icon" :size="20" /><span>{{ item.mobileLabel || item.label }}</span>
      </RouterLink>
      <button @click="mobileOpen = true"><Menu :size="20" /><span>Thêm</span></button>
    </nav>

    <ToastContainer />
  </v-app>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import type { Component } from 'vue';
import {
  BarChart3, CalendarDays, ContactRound, Images, LayoutDashboard, Menu,
  MessageSquareText, MoreHorizontal, PanelLeftClose, PanelLeftOpen,
  Settings, Sparkles, Target, UsersRound,
} from 'lucide-vue-next';
import GlobalSearch from '@/components/GlobalSearch.vue';
import NotificationBell from '@/components/NotificationBell.vue';
import ToastContainer from '@/components/ui/ToastContainer.vue';
import Avatar from '@/components/ui/Avatar.vue';
import McBrandMark from '@/components/ui/McBrandMark.vue';
import { useGsapMotion } from '@/composables/use-gsap-motion';
import { useAuthStore } from '@/stores/auth';

type NavItem = { path: string; label: string; mobileLabel?: string; icon: Component; resource?: string };
type NavGroup = { title: string; items: NavItem[] };

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const collapsed = ref(localStorage.getItem('monarch-sidebar-collapsed') === '1');
const mobileOpen = ref(false);
const sidebarEl = ref<HTMLElement | null>(null);
const topbarEl = ref<HTMLElement | null>(null);

const groups: NavGroup[] = [
  { title: 'Không gian làm việc', items: [
    { path: '/', label: 'Tổng quan', mobileLabel: 'Tổng quan', icon: LayoutDashboard },
    { path: '/chat', label: 'Tin nhắn', icon: MessageSquareText, resource: 'conversation' },
    { path: '/contacts', label: 'Khách hàng', icon: ContactRound, resource: 'contact' },
    { path: '/friends', label: 'Bạn bè Zalo', icon: UsersRound, resource: 'friend' },
    { path: '/appointments', label: 'Lịch hẹn', icon: CalendarDays },
  ] },
  { title: 'Tăng trưởng', items: [
    { path: '/marketing', label: 'Marketing', icon: Target },
    { path: '/media', label: 'Kho nội dung', icon: Images, resource: 'media' },
    { path: '/crm-rag', label: 'Sản phẩm & AI', icon: Sparkles, resource: 'settings' },
  ] },
  { title: 'Phân tích', items: [
    { path: '/reports', label: 'Báo cáo', icon: BarChart3, resource: 'engagement_score' },
  ] },
  { title: 'Hệ thống', items: [
    { path: '/settings', label: 'Cài đặt', icon: Settings },
  ] },
];

const visibleGroups = computed(() => groups
  .map((group) => ({ ...group, items: group.items.filter((item) => !item.resource || auth.canAccess(item.resource)) }))
  .filter((group) => group.items.length));

const allItems = computed(() => visibleGroups.value.flatMap((group) => group.items));
const mobileItems = computed(() => allItems.value.filter((item) => ['/', '/chat', '/contacts'].includes(item.path)));
const activeItem = computed(() => allItems.value
  .filter((item) => isActive(item.path))
  .sort((a, b) => b.path.length - a.path.length)[0]);
const pageTitle = computed(() => activeItem.value?.label || String(route.meta?.title || 'Monarch CRM'));
const sectionLabel = computed(() => visibleGroups.value.find((group) => group.items.includes(activeItem.value as NavItem))?.title || 'Monarch CRM');
const orgName = computed(() => auth.user?.orgName || '');
const orgInitial = computed(() => orgName.value.trim().charAt(0).toUpperCase() || 'M');
const roleLabel = computed(() => auth.user?.permissionGroupName || ({ owner: 'Chủ sở hữu', admin: 'Quản trị viên' }[auth.user?.role || ''] ?? 'Nhân viên'));

useGsapMotion(sidebarEl, (motion, root) => {
  motion.from(root.querySelectorAll('.mc-nav-item'), {
    autoAlpha: 0,
    x: -8,
    duration: 0.18,
    stagger: 0.018,
    ease: 'power2.out',
    clearProps: 'all',
  });

  const stopMobileOpen = watch(mobileOpen, (open) => {
    if (!open) return;
    motion.from(root.querySelectorAll('.mc-nav-item'), {
      autoAlpha: 0,
      x: -8,
      duration: 0.16,
      stagger: 0.015,
      ease: 'power2.out',
      clearProps: 'all',
    });
  }, { flush: 'post' });

  return stopMobileOpen;
});

useGsapMotion(topbarEl, (motion, root) => {
  const stopTitlePulse = watch(pageTitle, () => {
    const context = root.querySelector('.mc-topbar__context');
    if (!context) return;
    motion.fromTo(context, { autoAlpha: 0, y: -4 }, {
      autoAlpha: 1,
      y: 0,
      duration: 0.16,
      ease: 'power2.out',
      clearProps: 'all',
    });
  }, { flush: 'post' });

  return stopTitlePulse;
});

function isActive(path: string): boolean {
  if (path === '/') return route.path === '/';
  return route.path === path || route.path.startsWith(`${path}/`);
}
function toggleSidebar() {
  collapsed.value = !collapsed.value;
  localStorage.setItem('monarch-sidebar-collapsed', collapsed.value ? '1' : '0');
}
function logout() {
  auth.logout();
  void router.push('/login');
}
</script>
