<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<template>
  <div class="stuck-view">
    <header class="stuck-header">
      <button class="back-btn" @click="$router.back()"><CoolIcon name="Arrow_Left_MD" :size="14" /> Quay lại</button>
      <h1>
        Khách hàng đình trệ
        <span v-if="data && data.totalStuck > 0" class="count-badge">{{ data.totalStuck }}</span>
      </h1>
      <div class="stuck-search">
        <input
          v-model="searchQuery"
          type="search"
          placeholder="Tìm theo tên KH, SĐT, stage..."
          class="search-input"
        />
        <button v-if="searchQuery" class="clear-search" @click="searchQuery = ''" title="Xoá tìm kiếm"><CoolIcon name="Close_MD" :size="14" /></button>
      </div>
      <div class="stuck-actions">
        <button class="refresh-btn" :disabled="loading" @click="loadData">
          <CoolIcon :name="loading ? 'Loading' : 'Arrows_Reload_01'" :size="14" :class="{ 'is-spinning': loading }" /> Làm mới
        </button>
        <button class="scan-btn" :disabled="scanning" @click="triggerScan">
          <CoolIcon :name="scanning ? 'Loading' : 'Search_Magnifying_Glass'" :size="14" :class="{ 'is-spinning': scanning }" /> {{ scanning ? 'Đang quét…' : 'Quét lại ngay' }}
        </button>
      </div>
    </header>

    <div v-if="loading && !data" class="loading"><CoolIcon name="Timer" :size="14" /> Đang tải…</div>

    <div v-else-if="error" class="error"><CoolIcon name="Warning" :size="14" /> {{ error }}</div>

    <div v-else-if="data && data.totalStuck === 0" class="empty">
      <div class="empty-icon">🎉</div>
      <h2>Chưa có KH đình trệ nào</h2>
      <p>Pipeline đang chạy mượt. Tiếp tục nhé!</p>
    </div>

    <div v-else-if="data" class="stuck-banner">
      <div class="banner-content">
        <strong>{{ data.totalStuck }} khách hàng cần xử lý hôm nay</strong>
        <p>Click vào KH để mở chat, hoặc bấm "Gửi mẫu" để dùng template gợi ý.</p>
      </div>
    </div>

    <div v-if="data && filteredByStage.length === 0 && searchQuery" class="empty">
      <div class="empty-icon"><CoolIcon name="Search_Magnifying_Glass" :size="14" /></div>
      <h2>Không tìm thấy KH phù hợp</h2>
      <p>Thử từ khoá khác hoặc bấm <CoolIcon name="Close_MD" :size="14" /> để xoá tìm kiếm.</p>
    </div>

    <div v-if="data && filteredByStage.length > 0" class="stage-groups">
      <section v-for="group in filteredByStage" :key="group.stage" class="stage-group">
        <header class="stage-header" :style="{ borderLeftColor: group.color || '#6B7280' }">
          <span class="stage-chip" :style="{ backgroundColor: group.color || '#6B7280' }">
            {{ group.stage }}
          </span>
          <span class="stage-meta">
            {{ group.friends.length }} KH đình trệ > {{ group.thresholdDays }} ngày
          </span>
          <span class="alert-label">{{ group.alertLabel }}</span>
        </header>

        <div class="friends-list">
          <div v-for="f in group.friends" :key="f.friendId" class="friend-row">
            <div class="friend-avatar">
              <img v-if="f.contactAvatar" :src="f.contactAvatar" :alt="f.contactName" />
              <span v-else class="avatar-placeholder">{{ initials(f.contactName) }}</span>
            </div>
            <div class="friend-main">
              <div class="friend-name-row">
                <strong class="friend-name">{{ f.contactName }}</strong>
                <span v-for="tag in f.autoTags" :key="tag" class="auto-tag" :class="`tag-${tag}`">
                  {{ tagIcon(tag) }} {{ tagLabel(tag) }}
                </span>
              </div>
              <div class="friend-meta">
                Điểm <strong>{{ f.score }}</strong>
                · Đình trệ {{ f.daysInStage }} ngày
                <span v-if="f.daysSinceLastInbound != null">
                  · Tin nhắn cuối {{ f.daysSinceLastInbound }} ngày trước
                </span>
              </div>
              <div v-if="group.nbaTemplate" class="suggest-box"> <CoolIcon name="Bulb" :size="14" /> {{ group.alertLabel }}
              </div>
            </div>
            <div class="friend-actions">
              <button
                class="btn-primary"
                :title="group.nbaTemplate?.label || 'Gửi tin nhắn gợi ý'"
                @click="sendNbaTemplate(f, group)"
              > <CoolIcon name="Paper_Plane" :size="14" /> Gửi mẫu </button>
              <button class="btn-secondary" @click="openChat(f)"><CoolIcon name="Chat" :size="14" /> Mở chat</button>
              <button class="btn-ghost" @click="snooze(f)">⏸ Hoãn 3d</button>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- Toast feedback -->
    <div v-if="toast" class="toast" :class="toast.type">{{ toast.message }}</div>

    <!-- Template preview modal -->
    <div v-if="previewTemplate" class="modal-overlay" @click.self="previewTemplate = null">
      <div class="modal-card">
        <header class="modal-header">
          <h3><CoolIcon name="Paper_Plane" :size="14" /> Gửi tin nhắn gợi ý</h3>
          <button class="modal-close" @click="previewTemplate = null">×</button>
        </header>
        <div class="modal-body">
          <label class="modal-label">Tin nhắn (đã điền tên KH):</label>
          <textarea v-model="previewContent" rows="6" class="modal-textarea"></textarea>
          <p class="modal-hint">
            Em sẽ chuyển hướng sang chat để bạn copy/paste hoặc gửi trực tiếp.
            Phiên bản kế tiếp sẽ tự động gửi qua Zalo.
          </p>
        </div>
        <footer class="modal-footer">
          <button class="btn-secondary" @click="previewTemplate = null">Huỷ</button>
          <button class="btn-primary" @click="confirmSendTemplate">
            Mở chat với template
          </button>
        </footer>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useScoring, type StuckLeadsResponse, type StuckStageGroup, type StuckFriend } from '@/composables/use-scoring';
import { api } from '@/api/index';

const router = useRouter();
const scoring = useScoring();

const data = ref<StuckLeadsResponse | null>(null);
const loading = ref(false);

// Phase 6 polish P2 quick win — Search box trong Stuck Dashboard
// Filter client-side qua contactName / phone / stage. Search rỗng → show all.
const searchQuery = ref('');
const filteredByStage = computed<StuckStageGroup[]>(() => {
  if (!data.value) return [];
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return data.value.byStage;
  return data.value.byStage
    .map((group) => {
      const stageMatch = group.stage.toLowerCase().includes(q);
      const matchedFriends = group.friends.filter((f) => {
        if (stageMatch) return true;
        const name = (f.contactName || '').toLowerCase();
        const phone = (f.phone || '').toLowerCase();
        return name.includes(q) || phone.includes(q);
      });
      return { ...group, friends: matchedFriends };
    })
    .filter((g) => g.friends.length > 0);
});
const scanning = ref(false);
const error = ref<string | null>(null);
const toast = ref<{ type: 'success' | 'error'; message: string } | null>(null);

const previewTemplate = ref<{ friend: StuckFriend; group: StuckStageGroup } | null>(null);
const previewContent = ref('');

const TAG_LABELS: Record<string, string> = {
  active: 'Hoạt động',
  cooling: 'Đang nguội',
  cold: 'Nguội',
  frozen: 'Đóng băng',
  rewarmed: 'Ấm trở lại',
  stuck: 'Đình trệ',
  ready: 'Sẵn sàng chốt',
  atrisk: 'Có nguy cơ',
};

const TAG_ICONS: Record<string, string> = {
  active: '🔥',
  cooling: '❄️',
  cold: '🧊',
  frozen: '🥶',
  rewarmed: '🔄',
  stuck: '⏰',
  ready: '💯',
  atrisk: '🚧',
};

function initials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function tagLabel(tag: string): string {
  return TAG_LABELS[tag] || tag;
}

function tagIcon(tag: string): string {
  return TAG_ICONS[tag] || '🏷️';
}

async function loadData() {
  loading.value = true;
  error.value = null;
  try {
    data.value = await scoring.getStuckLeads();
  } catch (err: any) {
    error.value = err?.response?.data?.error || err?.message || 'Không tải được dữ liệu';
  } finally {
    loading.value = false;
  }
}

async function triggerScan() {
  scanning.value = true;
  try {
    const result = await scoring.scanStuckNow();
    showToast(
      'success',
      `Đã quét ${result.scanned} KH. ${result.newlyStuck} mới đình trệ, ${result.unstuck} hết đình trệ.`
    );
    await loadData();
  } catch (err: any) {
    showToast('error', 'Quét thất bại: ' + (err?.message || 'unknown'));
  } finally {
    scanning.value = false;
  }
}

function showToast(type: 'success' | 'error', message: string) {
  toast.value = { type, message };
  setTimeout(() => {
    toast.value = null;
  }, 3000);
}

function sendNbaTemplate(friend: StuckFriend, group: StuckStageGroup) {
  if (!group.nbaTemplate) {
    showToast('error', 'Chưa cấu hình template cho stage này');
    return;
  }
  previewTemplate.value = { friend, group };
  // Fill placeholders
  let content = group.nbaTemplate.contentTemplate;
  content = content.replace(/\{\{customerName\}\}/g, friend.contactName);
  content = content.replace(/\{\{projectName\}\}/g, 'dự án');
  content = content.replace(/\{\{promoMonth\}\}/g, 'ưu đãi tháng này');
  content = content.replace(/\{\{viewingLink\}\}/g, '');
  content = content.replace(/\{\{callTime\}\}/g, '');
  content = content.replace(/\{\{progressUpdate\}\}/g, '');
  content = content.replace(/\{\{unitInfo\}\}/g, '');
  content = content.replace(/\{\{priceInfo\}\}/g, '');
  previewContent.value = content;
}

async function confirmSendTemplate() {
  if (!previewTemplate.value) return;
  const friendId = previewTemplate.value.friend.friendId;
  const templateKey = previewTemplate.value.group.nbaTemplate?.key ?? null;
  const content = previewContent.value.trim();
  if (!content) { showToast('error', 'Nội dung rỗng'); return; }

  // Phase 6 polish P1 — gửi trực tiếp qua API thay copy clipboard.
  // BE: POST /leads/stuck/send-template { friendId, templateKey, overrideContent }
  //     → resolve conversation → render variables + markdown → sendMessage Zalo
  try {
    const res = await api.post('/leads/stuck/send-template', {
      friendId,
      templateKey,
      overrideContent: content,
    });
    if (res?.data?.ok) {
      previewTemplate.value = null;
      showToast('success', '✅ Đã gửi tin nhắn cho KH');
      // Optional: open chat để sale theo dõi rep
      router.push(`/chat?friendId=${friendId}`);
    } else {
      showToast('error', 'Gửi thất bại — kiểm tra connection nick Zalo');
    }
  } catch (err: any) {
    const msg = err?.response?.data?.error || err?.message || 'unknown';
    const detail = err?.response?.data?.message;
    if (msg === 'no_conversation') {
      // KH chưa từng chat — fallback clipboard + open chat
      if (navigator.clipboard) navigator.clipboard.writeText(content).catch(() => {});
      previewTemplate.value = null;
      showToast('success', 'KH chưa có hội thoại. Đã copy nội dung — mở chat để gửi.');
      router.push(`/chat?friendId=${friendId}`);
    } else if (msg === 'rate_limited') {
      showToast('error', `🚫 ${detail || 'Đã đạt giới hạn nhắn tin hôm nay'}`);
    } else if (msg === 'nick_disconnected') {
      showToast('error', '⚠ Nick Zalo của KH đang ngắt kết nối — reconnect lại trước');
    } else {
      showToast('error', `Lỗi: ${msg}`);
    }
  }
}

function openChat(f: StuckFriend) {
  router.push(`/chat?friendId=${f.friendId}`);
}

function snooze(f: StuckFriend) {
  // v1: chỉ ẩn UI local 3 ngày qua localStorage
  const key = `snooze:stuck:${f.friendId}`;
  const until = Date.now() + 3 * 24 * 60 * 60 * 1000;
  try {
    localStorage.setItem(key, String(until));
  } catch {
    /* ignore */
  }
  showToast('success', `Đã hoãn ${f.contactName} 3 ngày`);
  // Filter out from current view
  if (data.value) {
    for (const grp of data.value.byStage) {
      grp.friends = grp.friends.filter((x) => x.friendId !== f.friendId);
    }
    data.value.totalStuck = data.value.byStage.reduce((s, g) => s + g.friends.length, 0);
  }
}

onMounted(loadData);
</script>

<style scoped>
.stuck-view {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
}

.stuck-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}
.stuck-header h1 {
  font-size: 24px;
  margin: 0;
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}
.count-badge {
  background: #DC2626;
  color: white;
  font-size: 14px;
  padding: 2px 10px;
  border-radius: 12px;
  font-weight: 700;
}
.back-btn,
.refresh-btn,
.scan-btn {
  background: var(--mc-surface);
  border: 1px solid var(--mc-line);
  padding: 8px 14px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
}
.scan-btn {
  background: #6366F1;
  color: white;
  border-color: #6366F1;
}
.scan-btn:hover {
  background: #4F46E5;
}
.stuck-actions {
  display: flex;
  gap: 8px;
}

/* Phase 6 polish — Search box trong Stuck Dashboard */
.stuck-search {
  position: relative;
  flex: 1;
  max-width: 360px;
  margin: 0 12px;
}
.search-input {
  width: 100%;
  height: 36px;
  padding: 0 32px 0 12px;
  border: 1px solid var(--mc-line);
  border-radius: 8px;
  font-size: 13px;
  background: var(--mc-surface);
  color: var(--mc-ink);
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.search-input:focus {
  border-color: #6366F1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
}
.search-input::placeholder { color: #9CA3AF; }
.clear-search {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  font-size: 16px;
  color: var(--mc-muted);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
}
.clear-search:hover { color: var(--mc-ink); background: var(--mc-surface-alt); }

.loading,
.error,
.empty {
  background: var(--mc-surface);
  border-radius: 12px;
  padding: 48px;
  text-align: center;
  color: var(--mc-muted);
}
.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
}
.empty h2 {
  margin: 0 0 8px;
  color: var(--mc-ink);
}

.stuck-banner {
  background: linear-gradient(135deg, #FEF3C7, #FEE2E2);
  border-left: 4px solid #EF4444;
  padding: 16px 20px;
  border-radius: 12px;
  margin-bottom: 16px;
}
.stuck-banner strong {
  font-size: 16px;
  color: var(--mc-danger);
}
.stuck-banner p {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--mc-danger);
}

.stage-groups {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.stage-group {
  background: var(--mc-surface);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}
.stage-header {
  padding: 12px 16px;
  background: var(--mc-surface-alt);
  border-bottom: 1px solid #F3F4F6;
  border-left: 4px solid #6B7280;
  display: flex;
  align-items: center;
  gap: 12px;
}
.stage-chip {
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  color: white;
}
.stage-meta {
  font-size: 13px;
  color: var(--mc-muted);
}
.alert-label {
  font-size: 12px;
  color: var(--mc-text);
  font-style: italic;
  margin-left: auto;
}

.friends-list {
  padding: 0;
}
.friend-row {
  display: grid;
  grid-template-columns: 40px 1fr auto;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid #F3F4F6;
  align-items: center;
}
.friend-row:last-child {
  border-bottom: none;
}
.friend-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, #818CF8, #C084FC);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 600;
  font-size: 14px;
  overflow: hidden;
}
.friend-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.friend-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.friend-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.friend-name {
  font-size: 14px;
}
.auto-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
}
.tag-active { background: rgba(52,211,153,.14); color: var(--mc-success); }
.tag-stuck { background: rgba(248,113,113,.14); color: #DC2626; }
.tag-cold { background: rgba(108,125,232,.14); color: #aeb7ff; }
.tag-cooling { background: rgba(108,125,232,.14); color: #aeb7ff; }
.tag-frozen { background: var(--mc-surface-alt); color: var(--mc-muted); }
.tag-ready { background: rgba(251,191,36,.14); color: var(--mc-warning); }
.tag-rewarmed { background: #FCE7F3; color: #BE185D; }
.tag-atrisk { background: rgba(251,191,36,.14); color: var(--mc-warning); }

.friend-meta {
  font-size: 12px;
  color: var(--mc-muted);
}

.suggest-box {
  background: rgba(108,125,232,.14);
  border: 1px solid #BFDBFE;
  border-radius: 8px;
  padding: 6px 10px;
  margin-top: 4px;
  font-size: 12px;
  color: #aeb7ff;
}

.friend-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.btn-primary,
.btn-secondary,
.btn-ghost {
  border: none;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}
.btn-primary {
  background: #6366F1;
  color: white;
}
.btn-primary:hover {
  background: #4F46E5;
}
.btn-secondary {
  background: var(--mc-surface-alt);
  color: var(--mc-text);
  border: 1px solid var(--mc-line);
}
.btn-ghost {
  background: transparent;
  color: var(--mc-muted);
}

.toast {
  position: fixed;
  top: 24px;
  right: 24px;
  background: #111827;
  color: white;
  padding: 12px 20px;
  border-radius: 10px;
  font-size: 13px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.15);
  z-index: 9999;
  animation: slideIn 0.2s;
}
.toast.success {
  background: #10B981;
}
.toast.error {
  background: #EF4444;
}
@keyframes slideIn {
  from { transform: translateX(120%); }
  to { transform: translateX(0); }
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(17, 24, 39, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.modal-card {
  background: var(--mc-surface);
  border-radius: 12px;
  width: 90%;
  max-width: 520px;
  overflow: hidden;
}
.modal-header {
  padding: 16px 20px;
  border-bottom: 1px solid #F3F4F6;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.modal-header h3 {
  margin: 0;
  font-size: 16px;
}
.modal-close {
  border: none;
  background: transparent;
  font-size: 24px;
  cursor: pointer;
  color: #9CA3AF;
}
.modal-body {
  padding: 16px 20px;
}
.modal-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--mc-muted);
  margin-bottom: 8px;
}
.modal-textarea {
  width: 100%;
  border: 1px solid var(--mc-line);
  border-radius: 8px;
  padding: 10px;
  font-family: inherit;
  font-size: 13px;
  resize: vertical;
}
.modal-hint {
  font-size: 11px;
  color: #9CA3AF;
  margin-top: 8px;
}
.modal-footer {
  padding: 12px 20px;
  border-top: 1px solid #F3F4F6;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
