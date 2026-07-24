<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <div class="profile-page">
    <div class="page-head">
      <h2 class="page-title">Hồ sơ của tôi</h2>
      <p class="page-desc">Thông tin tài khoản cá nhân của bạn trong tổ chức {{ authStore.user?.orgName }}.</p>
    </div>

    <div v-if="authStore.user" class="profile-card">
      <div class="pc-avatar">
        <div class="avatar-circle">{{ initials }}</div>
      </div>
      <div class="pc-info">
        <div class="pc-row">
          <label>Họ tên</label>
          <div class="pc-value">{{ authStore.user.fullName }}</div>
        </div>
        <div class="pc-row">
          <label>Email</label>
          <div class="pc-value">{{ authStore.user.email }}</div>
        </div>
        <div class="pc-row">
          <label>Vai trò</label>
          <div class="pc-value">
            <span class="role-chip" :class="roleClass">{{ roleLabel }}</span>
          </div>
        </div>
        <div class="pc-row">
          <label>Tổ chức</label>
          <div class="pc-value">{{ authStore.user.orgName }}</div>
        </div>
        <div class="pc-row">
          <label>User ID</label>
          <div class="pc-value muted">{{ authStore.user.id }}</div>
        </div>
      </div>
    </div>

    <div class="actions">
      <button class="btn-ghost" disabled title="Sắp ra mắt"><CoolIcon name="Edit_Pencil_01" :size="14" /> Chỉnh sửa hồ sơ (sắp ra mắt)</button>
      <RouterLink to="/settings/personal/password" class="btn-primary">🔑 Đổi mật khẩu</RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useAuthStore } from '@/stores/auth';

const authStore = useAuthStore();

const initials = computed(() => {
  const name = authStore.user?.fullName || authStore.user?.email || '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0][0] || '?').toUpperCase();
  return (parts[0][0] + (parts[parts.length - 1][0] || '')).toUpperCase();
});

const roleLabel = computed(() => {
  const r = authStore.user?.role;
  if (r === 'owner') return 'Chủ sở hữu';
  if (r === 'admin') return 'Quản trị viên';
  return 'Nhân viên';
});

const roleClass = computed(() => `role-${authStore.user?.role || 'member'}`);
</script>

<style scoped>
.profile-page { max-width: 720px; font-family: inherit; }
.page-head { margin-bottom: 24px; }
.page-title { font-size: 20px; font-weight: 700; color: var(--mc-ink); margin: 0 0 4px; }
.page-desc { font-size: 13px; color: var(--mc-muted); margin: 0; }

.profile-card {
  background: var(--mc-surface);
  border: 1px solid var(--mc-line);
  border-radius: 12px;
  padding: 24px;
  display: flex;
  gap: 24px;
  margin-bottom: 20px;
}
.pc-avatar { flex-shrink: 0; }
.avatar-circle {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: linear-gradient(135deg, #5E6AD2, #8B5CF6);
  color: white;
  font-size: 24px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}
.pc-info { flex: 1; display: flex; flex-direction: column; gap: 14px; }
.pc-row { display: flex; align-items: baseline; gap: 16px; }
.pc-row label {
  width: 100px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--mc-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.pc-value { font-size: 14px; color: var(--mc-ink); font-weight: 500; }
.pc-value.muted { font-size: 12px; color: var(--mc-muted); font-family: monospace; }

.role-chip {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 600;
}
.role-chip.role-owner { background: rgba(251,191,36,.14); color: var(--mc-warning); }
.role-chip.role-admin { background: rgba(108,125,232,.14); color: #aeb7ff; }
.role-chip.role-member { background: rgba(52,211,153,.14); color: var(--mc-success); }

.actions { display: flex; gap: 10px; }
.btn-ghost,
.btn-primary {
  padding: 9px 16px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 8px;
  border: 1px solid var(--mc-line);
  background: var(--mc-surface);
  color: var(--mc-ink);
  cursor: pointer;
  font-family: inherit;
  text-decoration: none;
  display: inline-block;
}
.btn-ghost:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary { background: #5E6AD2; border-color: #aeb7ff; color: white; }
.btn-primary:hover { background: #4E5AB8; }
</style>
