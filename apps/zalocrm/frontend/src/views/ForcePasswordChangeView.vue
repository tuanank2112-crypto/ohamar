<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  ForcePasswordChangeView — Phase Onboarding v1 2026-05-24.
  Block UI khi user mới lần đầu login (passwordChangedAt === null).
  Không thể skip / close / logout cho tới khi đổi xong password.
  Monarch CRM onboarding security screen.
-->
<template>
  <div class="fpc-page">
    <div class="fpc-card">
      <div class="fpc-brand">
        <McBrandMark />
        <span v-if="brandName && brandName !== 'CRM'" class="fpc-workspace">Không gian {{ brandName }}</span>
      </div>

      <div class="fpc-icon">
        <CoolIcon name="Lock" :size="26" />
      </div>
      <h1 class="fpc-title">Đổi mật khẩu lần đầu</h1>
      <p class="fpc-sub">
        Admin đã giao bạn mật khẩu mặc định. Vì lý do bảo mật, bạn cần đổi sang
        mật khẩu riêng trước khi sử dụng CRM.
      </p>

      <form @submit.prevent="handleSubmit" class="fpc-form">
        <label class="fpc-label">Mật khẩu admin giao</label>
        <div class="pw-wrap">
          <input
            v-model="currentPassword"
            :type="showCur ? 'text' : 'password'"
            class="fpc-input"
            placeholder="••••••••"
            autocomplete="current-password"
            required
          />
          <button type="button" class="pw-eye" tabindex="-1"
                  :aria-label="showCur ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'"
                  @click="showCur = !showCur">
            <EyeOff v-if="showCur" :size="17" /><Eye v-else :size="17" />
          </button>
        </div>

        <label class="fpc-label">Mật khẩu mới</label>
        <div class="pw-wrap">
          <input
            v-model="newPassword"
            :type="showNew ? 'text' : 'password'"
            class="fpc-input"
            placeholder="••••••••"
            autocomplete="new-password"
            required
          />
          <button type="button" class="pw-eye" tabindex="-1"
                  :aria-label="showNew ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'"
                  @click="showNew = !showNew">
            <EyeOff v-if="showNew" :size="17" /><Eye v-else :size="17" />
          </button>
        </div>

        <div class="fpc-strength" v-if="newPassword">
          <div class="fpc-strength-row" :class="{ ok: hasLength }">
            <span class="fpc-check">{{ hasLength ? '✓' : '○' }}</span>
            Tối thiểu 8 ký tự
          </div>
          <div class="fpc-strength-row" :class="{ ok: hasUpper }">
            <span class="fpc-check">{{ hasUpper ? '✓' : '○' }}</span>
            Có ít nhất 1 chữ HOA
          </div>
          <div class="fpc-strength-row" :class="{ ok: hasLower }">
            <span class="fpc-check">{{ hasLower ? '✓' : '○' }}</span>
            Có ít nhất 1 chữ thường
          </div>
          <div class="fpc-strength-row" :class="{ ok: hasDigit }">
            <span class="fpc-check">{{ hasDigit ? '✓' : '○' }}</span>
            Có ít nhất 1 chữ số
          </div>
        </div>

        <label class="fpc-label">Nhập lại mật khẩu mới</label>
        <div class="pw-wrap">
          <input
            v-model="confirmPassword"
            :type="showConfirm ? 'text' : 'password'"
            class="fpc-input"
            :class="{ 'fpc-input-error': confirmPassword && confirmPassword !== newPassword }"
            placeholder="••••••••"
            autocomplete="new-password"
            required
          />
          <button type="button" class="pw-eye" tabindex="-1"
                  :aria-label="showConfirm ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'"
                  @click="showConfirm = !showConfirm">
            <EyeOff v-if="showConfirm" :size="17" /><Eye v-else :size="17" />
          </button>
        </div>
        <div v-if="confirmPassword && confirmPassword !== newPassword" class="fpc-mismatch">
          Mật khẩu nhập lại không khớp
        </div>

        <div v-if="error" class="fpc-error">{{ error }}</div>

        <button
          type="submit"
          class="fpc-submit"
          :disabled="!canSubmit || submitting"
        >
          <span v-if="submitting">Đang đổi mật khẩu…</span>
          <span v-else>Đổi mật khẩu</span>
        </button>

        <p class="fpc-note">
          Sau khi đổi, bạn sẽ được đăng xuất và cần đăng nhập lại với mật khẩu mới.
        </p>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { Eye, EyeOff } from 'lucide-vue-next';
import { api } from '@/api/index';
import { useAuthStore } from '@/stores/auth';
import { fetchPublicBranding } from '@/api/public-branding';
import McBrandMark from '@/components/ui/McBrandMark.vue';

const router = useRouter();
const auth = useAuthStore();

const brandName = ref('CRM');
onMounted(() => {
  fetchPublicBranding()
    .then((b) => {
      if (!b) return;
      brandName.value = b.name || 'CRM';
    })
    .catch(() => {});
});

const currentPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const submitting = ref(false);
const error = ref('');
const showCur = ref(false);
const showNew = ref(false);
const showConfirm = ref(false);

const hasLength = computed(() => newPassword.value.length >= 8);
const hasUpper = computed(() => /[A-Z]/.test(newPassword.value));
const hasLower = computed(() => /[a-z]/.test(newPassword.value));
const hasDigit = computed(() => /\d/.test(newPassword.value));
const allValid = computed(() => hasLength.value && hasUpper.value && hasLower.value && hasDigit.value);
const canSubmit = computed(() =>
  currentPassword.value && allValid.value && newPassword.value === confirmPassword.value,
);

async function handleSubmit() {
  if (!canSubmit.value) return;
  submitting.value = true;
  error.value = '';
  try {
    await api.post('/me/change-password', {
      currentPassword: currentPassword.value,
      newPassword: newPassword.value,
    });
    // Logout (clear JWT cũ đã bị revoke) + redirect login
    auth.logout();
    router.push('/login?password-changed=1');
  } catch (err: any) {
    error.value = err?.response?.data?.error || 'Đổi mật khẩu thất bại';
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.fpc-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(900px 500px at 10% 0%, rgba(34, 211, 238, .16), transparent 60%),
    radial-gradient(900px 500px at 100% 100%, rgba(79, 70, 229, .15), transparent 60%),
    #f7f8fc;
  padding: 16px;
  /* tránh tràn ngang trên màn hẹp + cho cuộn dọc nếu card cao hơn viewport ngắn */
  overflow-x: hidden;
  box-sizing: border-box;
  font-family: var(--font, "Plus Jakarta Sans", sans-serif);
}

.fpc-card {
  background: var(--surface, #fff);
  border: 1px solid var(--line, var(--mc-line));
  border-radius: var(--r-xl, 18px);
  padding: 32px 36px 30px;
  max-width: 440px;
  width: 100%;
  box-sizing: border-box;
  box-shadow: 0 24px 60px rgba(6, 34, 47, 0.36);
}

/* Màn hẹp (auth mở trên điện thoại): card co + giảm padding để không tràn */
@media (max-width: 480px) {
  .fpc-card { padding: 26px 20px 24px; border-radius: var(--r-lg, 14px); }
  .fpc-title { font-size: 19px; }
}

/* Brand lockup */
.fpc-brand {
  display: flex; flex-direction:column; align-items: center; justify-content: center; gap: 8px;
  margin-bottom: 22px;
}
.fpc-workspace { color:var(--mc-muted,#64748b);font-size:10px;font-weight:650;letter-spacing:.4px; }

.fpc-icon {
  width: 60px; height: 60px;
  background: var(--brand-soft, #e4f1f8);
  color: var(--brand, #1786be);
  border-radius: var(--r-lg, 14px);
  display: flex; align-items: center; justify-content: center;
  margin: 0 auto 14px;
}

.fpc-title {
  text-align: center;
  font-size: 21px;
  font-weight: 700;
  color: var(--ink, #141a24);
  margin: 0 0 8px;
}

.fpc-sub {
  text-align: center;
  color: var(--ink-3, #6b7488);
  font-size: 13.5px;
  line-height: 1.55;
  margin: 0 0 22px;
}

.fpc-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fpc-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-2, #475066);
  margin-top: 8px;
}

.fpc-input {
  padding: 11px 14px;
  border: 1px solid var(--line, var(--mc-line));
  border-radius: var(--r-md, 10px);
  font-size: 14px;
  font-family: var(--mono, "Roboto Mono", monospace);
  letter-spacing: .04em;
  color: var(--ink, #141a24);
  background: var(--surface, #fff);
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.fpc-input:focus {
  border-color: var(--brand, #1786be);
  box-shadow: 0 0 0 3px var(--brand-soft, #e4f1f8);
}
.fpc-input-error {
  border-color: var(--error, #ef4444);
}

.pw-wrap { position: relative; }
.pw-wrap input { padding-right: 40px; width: 100%; box-sizing: border-box; }
.pw-eye {
  position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
  display: flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; padding: 0; margin: 0;
  border: none; background: transparent; cursor: pointer;
  color: var(--ink-4, #97a0b3); border-radius: 6px;
}
.pw-eye:hover { color: var(--ink-2, #475066); background: rgba(0,0,0,.04); }

.fpc-strength {
  background: var(--brand-softer, #f2f8fc);
  border: 1px solid var(--line, var(--mc-line));
  padding: 10px 14px;
  border-radius: var(--r-sm, 8px);
  margin: 4px 0;
}
.fpc-strength-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  color: var(--ink-3, #6b7488);
  padding: 2px 0;
}
.fpc-strength-row.ok {
  color: var(--success, #0f9d58);
}
.fpc-check {
  font-weight: 700;
  width: 16px;
  font-family: var(--mono, monospace);
}

.fpc-mismatch {
  font-size: 12px;
  color: var(--error, #dc2626);
  margin-top: 2px;
}

.fpc-error {
  background: var(--error-soft, #fef2f2);
  color: var(--error, #b91c1c);
  border: 1px solid #fca5a5;
  padding: 10px 14px;
  border-radius: var(--r-sm, 8px);
  font-size: 13px;
  margin-top: 6px;
}

.fpc-submit {
  margin-top: 14px;
  background: var(--brand, #1786be);
  color: #fff;
  border: none;
  padding: 13px 24px;
  border-radius: var(--r-md, 10px);
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s;
}
.fpc-submit:hover:not(:disabled) {
  background: var(--brand-600, #0f6fa0);
}
.fpc-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.fpc-note {
  text-align: center;
  font-size: 11.5px;
  color: var(--ink-3, #6b7488);
  margin: 12px 0 0;
}
</style>
