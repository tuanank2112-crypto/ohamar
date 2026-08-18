<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<template>
  <div class="cp-view">
    <header class="cp-header">
      <button class="back-btn" type="button" @click="$router.back()">
        <CoolIcon name="Arrow_Left" :size="15" />
        Quay lại
      </button>
      <div class="cp-title">
        <img v-if="profile?.contact.avatarUrl" class="cp-avatar" :src="profile.contact.avatarUrl" alt="" />
        <div v-else class="cp-avatar cp-avatar-fallback">{{ initials }}</div>
        <div class="cp-title-text">
          <h1>{{ displayName }}</h1>
          <div class="cp-subtitle">
            <span>{{ profile?.contact.statusName || 'Chưa có trạng thái' }}</span>
            <span v-if="profile?.primaryOwner">Phụ trách: {{ profile.primaryOwner.userName }}</span>
          </div>
        </div>
      </div>
      <div v-if="profile" class="cp-score" title="Điểm tổng hợp cao nhất từ các nick Zalo">
        <span>{{ profile.aggregateScore }}</span>
        <small>Score</small>
      </div>
    </header>

    <div v-if="loading" class="cp-state">
      <CoolIcon name="Timer" :size="16" />
      Đang tải hồ sơ tổng hợp...
    </div>

    <div v-else-if="error" class="cp-state cp-error">
      <CoolIcon name="Warning" :size="16" />
      {{ error }}
    </div>

    <div v-else-if="profile" class="cp-content">
      <section class="cp-section">
        <h2>Thông tin chung</h2>
        <div class="cp-info-grid">
          <div class="cp-info-row">
            <span class="cp-label">Tên CRM</span>
            <span class="cp-value">{{ profile.contact.crmName || profile.contact.fullName || '-' }}</span>
          </div>
          <div class="cp-info-row">
            <span class="cp-label">Điện thoại</span>
            <span class="cp-value">{{ phonesText }}</span>
          </div>
          <div class="cp-info-row">
            <span class="cp-label">Email</span>
            <span class="cp-value">{{ profile.contact.email || '-' }}</span>
          </div>
          <div class="cp-info-row">
            <span class="cp-label">Địa chỉ</span>
            <span class="cp-value">{{ addressText }}</span>
          </div>
          <div class="cp-info-row">
            <span class="cp-label">Nghề nghiệp</span>
            <span class="cp-value">{{ profile.contact.occupation || '-' }}</span>
          </div>
          <div class="cp-info-row">
            <span class="cp-label">Sinh nhật</span>
            <span class="cp-value">{{ birthdayText }}</span>
          </div>
          <div class="cp-info-row">
            <span class="cp-label">Giới tính</span>
            <span class="cp-value">{{ genderText }}</span>
          </div>
        </div>
      </section>

      <section class="cp-section">
        <div class="cp-section-head">
          <h2>Nick Zalo</h2>
          <span class="cp-count">{{ profile.friends.length }}</span>
        </div>
        <div v-if="profile.friends.length" class="cp-friend-list">
          <article v-for="friend in profile.friends" :key="friend.id" class="cp-friend">
            <div class="cp-friend-main">
              <strong>{{ friend.displayName || friend.aliasInNick || friend.zaloUid || 'Không rõ tên' }}</strong>
              <span>{{ friend.accountName || friend.accountId }}</span>
            </div>
            <div class="cp-friend-meta">
              <span>{{ friend.relationshipKind }}</span>
              <span>{{ friend.statusName || 'Chưa có trạng thái' }}</span>
              <span>Score {{ friend.leadScore }}</span>
              <span>{{ friend.totalInbound }} vào / {{ friend.totalOutbound }} ra</span>
              <span>{{ formatDate(friend.lastInboundAt) }}</span>
            </div>
          </article>
        </div>
        <p v-else class="cp-empty">Chưa có nick Zalo gắn với khách hàng này.</p>
      </section>

      <section class="cp-section">
        <div class="cp-section-head">
          <h2>Tags tổng hợp</h2>
          <span class="cp-count">{{ profile.aggregateTags.length }}</span>
        </div>
        <div v-if="profile.aggregateTags.length" class="cp-tags">
          <span v-for="tag in profile.aggregateTags" :key="tag" class="cp-tag">{{ tag }}</span>
        </div>
        <p v-else class="cp-empty">Chưa có tag.</p>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useContactProfile } from '@/composables/use-contact-profile';

const route = useRoute();
const contactId = computed(() => String(route.params.id || ''));
const { profile, loading, error, fetchContactProfile } = useContactProfile();

const displayName = computed(() => profile.value?.contact.displayName || profile.value?.contact.fullName || 'Hồ sơ khách hàng');
const initials = computed(() => {
  const name = displayName.value.trim();
  if (!name || name === 'Hồ sơ khách hàng') return 'KH';
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
});

const phonesText = computed(() => {
  const contact = profile.value?.contact;
  if (!contact) return '-';
  return [contact.phone, contact.phone2, contact.phone3].filter(Boolean).join(' · ') || '-';
});

const addressText = computed(() => {
  const contact = profile.value?.contact;
  if (!contact) return '-';
  return [contact.addressLine, contact.ward, contact.district, contact.province].filter(Boolean).join(', ') || '-';
});

const birthdayText = computed(() => {
  const contact = profile.value?.contact;
  if (!contact) return '-';
  const date = formatDate(contact.birthDate);
  if (date !== '-') return date;
  return contact.birthYear ? String(contact.birthYear) : '-';
});

const genderText = computed(() => {
  const gender = profile.value?.contact.gender;
  if (gender === 'male') return 'Nam';
  if (gender === 'female') return 'Nữ';
  if (gender === 'other') return 'Khác';
  return '-';
});

function formatDate(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

onMounted(() => {
  if (contactId.value) void fetchContactProfile(contactId.value);
});

watch(contactId, (id) => {
  if (id) void fetchContactProfile(id);
});
</script>

<style scoped>
.cp-view {
  max-width: 1060px;
  margin: 0 auto;
  padding: 24px;
  font-family: -apple-system, "Segoe UI", "Inter", system-ui, sans-serif;
}

.cp-header {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 18px;
  margin-bottom: 22px;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: var(--mc-surface);
  border: 1px solid var(--mc-line);
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  color: var(--mc-text);
  font-family: inherit;
  white-space: nowrap;
}

.back-btn:hover {
  border-color: #6366f1;
  color: #aeb7ff;
}

.cp-title {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 14px;
}

.cp-avatar {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  object-fit: cover;
  flex: 0 0 auto;
  background: var(--mc-surface);
  border: 1px solid var(--mc-line);
}

.cp-avatar-fallback {
  display: grid;
  place-items: center;
  color: #111827;
  background: #d1fae5;
  font-weight: 800;
  font-size: 15px;
}

.cp-title-text {
  min-width: 0;
}

.cp-title h1 {
  color: var(--mc-ink);
  font-size: 24px;
  font-weight: 750;
  line-height: 1.2;
  margin: 0;
  overflow-wrap: anywhere;
}

.cp-subtitle {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  margin-top: 5px;
  color: var(--mc-muted);
  font-size: 13px;
}

.cp-score {
  min-width: 72px;
  border: 1px solid var(--mc-line);
  border-radius: 8px;
  background: var(--mc-surface);
  padding: 8px 12px;
  text-align: center;
}

.cp-score span {
  display: block;
  color: #10b981;
  font-weight: 800;
  font-size: 22px;
  line-height: 1;
}

.cp-score small {
  color: var(--mc-muted);
  font-size: 11px;
}

.cp-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 220px;
  border: 1px solid var(--mc-line);
  border-radius: 8px;
  background: var(--mc-surface);
  color: var(--mc-muted);
}

.cp-error {
  color: #dc2626;
}

.cp-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.cp-section {
  background: var(--mc-surface);
  border: 1px solid var(--mc-line);
  border-radius: 8px;
  padding: 18px 20px;
}

.cp-section h2 {
  color: var(--mc-ink);
  font-size: 16px;
  font-weight: 750;
  margin: 0 0 14px;
}

.cp-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.cp-section-head h2 {
  margin: 0;
}

.cp-count {
  border: 1px solid var(--mc-line);
  border-radius: 999px;
  color: var(--mc-muted);
  font-size: 12px;
  min-width: 28px;
  padding: 2px 8px;
  text-align: center;
}

.cp-info-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 22px;
}

.cp-info-row {
  display: grid;
  grid-template-columns: 128px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
  font-size: 13px;
}

.cp-label {
  color: var(--mc-muted);
  font-weight: 650;
}

.cp-value {
  color: var(--mc-ink);
  overflow-wrap: anywhere;
}

.cp-friend-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cp-friend {
  border: 1px solid var(--mc-line);
  border-radius: 8px;
  padding: 12px 14px;
}

.cp-friend-main {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.cp-friend-main strong {
  color: var(--mc-ink);
  font-size: 14px;
  overflow-wrap: anywhere;
}

.cp-friend-main span {
  color: var(--mc-muted);
  font-size: 12px;
  text-align: right;
}

.cp-friend-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.cp-friend-meta span,
.cp-tag {
  border: 1px solid var(--mc-line);
  border-radius: 999px;
  color: var(--mc-text);
  font-size: 12px;
  padding: 3px 9px;
  background: rgba(255, 255, 255, 0.04);
}

.cp-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.cp-empty {
  color: var(--mc-muted);
  font-size: 13px;
  margin: 0;
}

@media (max-width: 760px) {
  .cp-view {
    padding: 16px;
  }

  .cp-header {
    grid-template-columns: 1fr;
    align-items: stretch;
  }

  .cp-score {
    justify-self: start;
  }

  .cp-info-grid {
    grid-template-columns: 1fr;
  }

  .cp-info-row {
    grid-template-columns: 112px minmax(0, 1fr);
  }

  .cp-friend-main {
    align-items: flex-start;
    flex-direction: column;
    gap: 4px;
  }

  .cp-friend-main span {
    text-align: left;
  }
}
</style>
