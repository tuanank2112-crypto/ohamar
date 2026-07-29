<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <div class="mc-login-card">
    <aside class="mc-login-story">
      <div class="mc-login-story__mesh" />
      <McBrandMark />
      <div class="mc-login-story__content">
        <span class="mc-eyebrow">Customer operations workspace</span>
        <h1>Biến mọi cuộc hội thoại thành quan hệ khách hàng bền vững.</h1>
        <p>Quản lý tin nhắn, khách hàng và hiệu suất đội ngũ trong một không gian làm việc thống nhất.</p>
        <div class="mc-login-points">
          <div><MessageSquareText :size="17" /><span><strong>Hội thoại tập trung</strong><small>Đồng bộ nhiều tài khoản Zalo theo thời gian thực</small></span></div>
          <div><ContactRound :size="17" /><span><strong>Hồ sơ khách hàng đầy đủ</strong><small>Không bỏ lỡ lịch sử, nhãn và cơ hội chăm sóc</small></span></div>
          <div><ChartNoAxesCombined :size="17" /><span><strong>Quyết định dựa trên dữ liệu</strong><small>KPI rõ ràng cho sale, quản lý và vận hành</small></span></div>
        </div>
      </div>
      <div v-if="hasOrgBranding" class="mc-login-tenant">
        <img v-if="tenantLogo" :src="tenantLogo" :alt="brandName" @error="tenantLogo = null" />
        <span v-else class="mc-login-tenant__fallback">{{ brandName.trim().charAt(0).toUpperCase() }}</span>
        <div><span>Không gian làm việc</span><strong>{{ brandName }}</strong></div>
      </div>
      <span class="mc-login-version">Monarch CRM · Secure customer workspace</span>
    </aside>

    <section class="mc-login-form">
      <div class="mc-login-form__inner">
        <div class="mc-login-form__head">
          <span class="mc-eyebrow">Đăng nhập an toàn</span>
          <h2>Chào mừng bạn quay lại</h2>
          <p>Sử dụng tài khoản được cấp để tiếp tục vào Monarch CRM.</p>
        </div>
        <v-form @submit.prevent="handleLogin">
          <label class="mc-field-label" for="mc-login-id">Email hoặc số điện thoại</label>
          <v-text-field
            id="mc-login-id"
            v-model="identifier"
            type="text"
            variant="outlined"
            required
            autocomplete="username"
            :placeholder="emailPlaceholder"
            persistent-placeholder
            hide-details="auto"
            class="mc-login-field mb-4"
          >
            <template #prepend-inner><UserRound :size="17" /></template>
          </v-text-field>
          <div class="mc-field-label-row">
            <label class="mc-field-label" for="mc-login-password">Mật khẩu</label>
          </div>
          <v-text-field
            id="mc-login-password"
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            variant="outlined"
            required
            autocomplete="current-password"
            placeholder="Nhập mật khẩu"
            persistent-placeholder
            hide-details="auto"
            class="mc-login-field mb-5"
          >
            <template #prepend-inner><LockKeyhole :size="17" /></template>
            <template #append-inner>
              <button type="button" class="mc-password-toggle" :aria-label="showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'" @click="showPassword = !showPassword">
                <EyeOff v-if="showPassword" :size="17" /><Eye v-else :size="17" />
              </button>
            </template>
          </v-text-field>
          <McButton type="submit" size="lg" :loading="loading" class="mc-login-submit">Đăng nhập</McButton>
        </v-form>
        <div v-if="passwordChangedNotice" class="mc-login-alert mc-login-alert--success">Mật khẩu đã được cập nhật. Hãy đăng nhập bằng mật khẩu mới.</div>
        <div v-if="error" class="mc-login-alert mc-login-alert--error">{{ error }}</div>
        <p class="mc-login-help">Bạn gặp vấn đề khi đăng nhập? Liên hệ quản trị viên của tổ chức.</p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { fetchPublicBranding } from '@/api/public-branding';
import McBrandMark from '@/components/ui/McBrandMark.vue';
import McButton from '@/components/ui/McButton.vue';
import { ChartNoAxesCombined, ContactRound, Eye, EyeOff, LockKeyhole, MessageSquareText, UserRound } from 'lucide-vue-next';

// SĐT mẫu cố định trong gợi ý ô đăng nhập (kèm sau email theo tên miền tổ chức).
const SAMPLE_PHONE = '0901 234 567';

const identifier = ref('');
const password = ref('');
const showPassword = ref(false);
const loading = ref(false);
const error = ref('');
const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

// ── Branding workspace (fallback về nhận diện Monarch) ────────────────────────
// Login chạy pre-auth: render mặc định NGAY, fetch org-branding xong mới thay vào
// (D4-A). Nếu endpoint lỗi/chậm/chưa có org → giữ mặc định, login không bị chặn.
const DEFAULT_PLACEHOLDER = `admin@example.com hoặc ${SAMPLE_PHONE}`;
const brandName = ref('CRM');
const emailPlaceholder = ref(DEFAULT_PLACEHOLDER);
const hasOrgBranding = ref(false);
const tenantLogo = ref<string | null>(null);

// Phase Onboarding v1 — sau khi force change password thành công, redirect về /login?password-changed=1
const passwordChangedNotice = ref(route.query['password-changed'] === '1');

onMounted(() => {
  // Setup-check (điều hướng /setup) và branding fetch chạy song song, độc lập.
  authStore
    .checkSetup()
    .then((needs) => {
      if (needs) router.replace('/setup');
    })
    .catch(() => {});

  fetchPublicBranding()
    .then((b) => {
      if (!b) return; // fetch lỗi → giữ mặc định hardcode (resilience)
      // Org tồn tại → hiển thị ĐÚNG cấu hình: trường trống thì ẩn (banner v-if),
      // KHÔNG giữ chữ mặc định (fix slogan vẫn ra "Bền vững · Trường tồn").
      brandName.value = b.name || 'CRM';
      hasOrgBranding.value = Boolean(b.logoUrl || b.name);
      tenantLogo.value = b.logoUrl || null;
      emailPlaceholder.value = b.emailDomain
        ? `user@${b.emailDomain} hoặc ${SAMPLE_PHONE}`
        : DEFAULT_PLACEHOLDER;
    })
    .catch(() => {});
});

async function handleLogin() {
  loading.value = true;
  error.value = '';
  try {
    await authStore.login(identifier.value, password.value);
    router.push('/');
  } catch (err: any) {
    // 2026-06-09 (anh báo lỗi "Unauthorized"): server trả {error:'Unauthorized', message:'...'}
    // cho lỗi 401 — field `error` là tên HTTP status (xấu), `message` mới là câu tiếng Việt.
    // Ưu tiên đọc message; nếu là tên status thì fallback câu dễ hiểu.
    const data = err.response?.data;
    const raw = data?.message || data?.error || '';
    const isStatusName = /^(unauthorized|bad request|forbidden|internal server error)$/i.test(raw);
    error.value = (raw && !isStatusName) ? raw : 'Email/SĐT hoặc mật khẩu không đúng';
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.mc-login-card {
  width: min(1080px, calc(100vw - 40px));
  min-height: 630px;
  display: grid;
  grid-template-columns: 1.08fr .92fr;
  overflow: hidden;
  border: 1px solid var(--mc-line);
  border-radius: 18px;
  background: var(--mc-surface);
  box-shadow: 0 30px 80px -30px rgba(15, 23, 42, .28);
}
.mc-login-story { position: relative; padding: 34px 42px 30px; display: flex; flex-direction: column; overflow: hidden; border-right: 1px solid rgba(255,255,255,.08); background: #0f172a; color: #fff; }
.mc-login-story__mesh { position: absolute; inset: 0; pointer-events: none; opacity: .8; background: radial-gradient(circle at 80% 15%, rgba(34,211,238,.24), transparent 30%), radial-gradient(circle at 10% 90%, rgba(79,70,229,.33), transparent 40%), linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px); background-size: auto,auto,32px 32px,32px 32px; }
.mc-login-story :deep(.mc-brand-mark),.mc-login-story__content,.mc-login-tenant,.mc-login-version { position: relative; z-index: 1; }
.mc-login-story :deep(.mc-brand-mark) { align-self: flex-start; padding: 8px 10px; border-radius: 10px; background: var(--mc-surface); }
.mc-login-story :deep(.mc-brand-mark img) { width: 150px; }
.mc-login-story__content { margin: auto 0; max-width: 465px; }
.mc-eyebrow { color: #0891b2; font-size: 10px; font-weight: 800; letter-spacing: 1.15px; text-transform: uppercase; }
.mc-login-story .mc-eyebrow { color: #67e8f9; }
.mc-login-story h1 { max-width: 450px; margin: 14px 0 14px; font-size: clamp(30px,3vw,42px); line-height: 1.12; letter-spacing: -1.5px; }
.mc-login-story__content > p { max-width: 440px; color: var(--mc-text); font-size: 14px; line-height: 1.65; }
.mc-login-points { display: grid; gap: 14px; margin-top: 28px; }
.mc-login-points > div { display: flex; align-items: flex-start; gap: 11px; }
.mc-login-points > div > svg { margin-top: 2px; color: #22d3ee; }
.mc-login-points span { display: flex; flex-direction: column; }
.mc-login-points strong { color: #f8fafc; font-size: 12px; }
.mc-login-points small { margin-top: 3px; color: var(--mc-muted); font-size: 10px; }
.mc-login-tenant { align-self: flex-start; max-width: 300px; margin-top: 22px; padding: 8px 11px; display: flex; align-items: center; gap: 9px; border: 1px solid rgba(255,255,255,.12); border-radius: 9px; background: rgba(255,255,255,.06); }
.mc-login-tenant img { width: 28px; height: 28px; border-radius: 6px; object-fit: contain; background: var(--mc-surface); }
.mc-login-tenant__fallback { width: 28px; height: 28px; border-radius: 6px; display: grid; place-items: center; color: #fff !important; background: linear-gradient(135deg,#22d3ee,#2563eb); font-size: 11px !important; font-weight: 800; }
.mc-login-tenant div { min-width: 0; display: flex; flex-direction: column; }
.mc-login-tenant span,.mc-login-version { color: var(--mc-muted); font-size: 9px; letter-spacing: .55px; text-transform: uppercase; }
.mc-login-tenant strong { max-width: 220px; color: var(--mc-ink); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mc-login-version { margin-top: 16px; }
.mc-login-form { padding: 48px 50px; display: grid; place-items: center; background: var(--mc-surface); }
.mc-login-form__inner { width: 100%; max-width: 360px; }
.mc-login-form__head { margin-bottom: 28px; }
.mc-login-form__head h2 { margin: 8px 0 7px; color: var(--mc-ink); font-size: 27px; line-height: 1.2; letter-spacing: -.65px; }
.mc-login-form__head p { margin: 0; color: var(--mc-muted); font-size: 12px; line-height: 1.55; }
.mc-field-label-row { display: flex; justify-content: space-between; }
.mc-field-label { display: inline-block; margin-bottom: 7px; color: var(--mc-text); font-size: 11px; font-weight: 700; }
.mc-login-field :deep(.v-field) { min-height: 44px; color: var(--mc-ink); background: var(--mc-surface); border-radius: 8px !important; }
.mc-login-field :deep(.v-field__outline) { color: var(--mc-line); }
.mc-login-field :deep(.v-field--focused .v-field__outline) { color: #2563eb; }
.mc-login-field :deep(.v-field__prepend-inner) { color: var(--mc-muted); }
.mc-password-toggle { width: 28px; height: 28px; border: 0; display: grid; place-items: center; color: var(--mc-muted); background: transparent; cursor: pointer; }
.mc-login-submit { width: 100%; }
.mc-login-alert { margin-top: 14px; padding: 10px 12px; border-radius: 8px; font-size: 11px; line-height: 1.45; }
.mc-login-alert--success { color: var(--mc-success); border: 1px solid #bbf7d0; background: rgba(52,211,153,.14); }
.mc-login-alert--error { color: var(--mc-danger); border: 1px solid #fecaca; background: rgba(248,113,113,.14); }
.mc-login-help { margin: 25px 0 0; color: var(--mc-muted); font-size: 10px; text-align: center; }

@media (max-width: 900px) {
  .mc-login-card { grid-template-columns: 1fr; width: min(520px,calc(100vw - 24px)); max-height: calc(100vh - 24px); overflow-y: auto; }
  .mc-login-story { min-height: 250px; padding: 24px 28px; }
  .mc-login-story__content { margin: 35px 0 10px; }
  .mc-login-story h1 { font-size: 28px; }
  .mc-login-points,.mc-login-version { display: none; }
  .mc-login-form { padding: 32px 28px; }
}

/* Điện thoại nhỏ: giảm lề/padding, bo nhỏ lại cho vừa khung hẹp. */
@media (max-width: 480px) {
  .mc-login-card { border-radius: 12px; }
  .mc-login-story { min-height: 210px; padding: 20px; }
  .mc-login-story h1 { font-size: 23px; }
  .mc-login-story__content > p { font-size: 12px; }
  .mc-login-tenant { display: none; }
  .mc-login-form { padding: 27px 20px; }
  .mc-login-form__head h2 { font-size: 23px; }
}
</style>
