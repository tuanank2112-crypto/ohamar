<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<template>
  <div class="preview-card">
    <aside class="preview-story">
      <McBrandMark />
      <div class="preview-copy">
        <span>Customer operations workspace</span>
        <h2>Biến mọi cuộc hội thoại thành quan hệ khách hàng bền vững.</h2>
        <p>{{ slogan || 'Quản lý khách hàng và đội ngũ trong một không gian thống nhất.' }}</p>
      </div>
      <div class="preview-tenant">
        <img v-if="logoUrl" :src="logoUrl" :alt="name" />
        <b v-else>{{ name.trim().charAt(0).toUpperCase() }}</b>
        <div><small>Không gian làm việc</small><strong>{{ name }}</strong></div>
      </div>
      <small class="preview-copyright">{{ copyright }}</small>
    </aside>
    <section class="preview-form-wrap">
      <div class="form-inner">
        <span class="eyebrow">Đăng nhập an toàn</span>
        <h2 class="form-title">Chào mừng bạn quay lại</h2>
        <p class="form-sub">Sử dụng tài khoản được cấp để tiếp tục.</p>
        <v-text-field
          :model-value="''"
          label="Email hoặc số điện thoại"
          variant="outlined"
          prepend-inner-icon="mdi-account-outline"
          :placeholder="emailPlaceholder"
          persistent-placeholder
          readonly
          hide-details
          class="mb-4"
        />
        <v-text-field
          :model-value="''"
          label="Mật khẩu"
          type="password"
          variant="outlined"
          prepend-inner-icon="mdi-lock-outline"
          placeholder="Nhập mật khẩu"
          persistent-placeholder
          readonly
          hide-details
          class="mb-5"
        />
        <v-btn color="primary" block size="large" rounded="lg">
          <v-icon start>mdi-login</v-icon>
          Đăng nhập
        </v-btn>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import McBrandMark from '@/components/ui/McBrandMark.vue';

defineProps<{
  logoUrl?: string | null;
  name: string;
  slogan?: string | null;
  copyright?: string | null;
  emailPlaceholder: string;
}>();
</script>

<style scoped>
.preview-card {
  display: grid;
  grid-template-columns: 1.05fr .95fr;
  width: 880px;
  height: 460px;
  pointer-events: none;
  background: var(--mc-surface);
  border:1px solid var(--mc-line);
  border-radius: 16px;
  overflow: hidden;
  box-shadow:0 20px 50px -24px rgba(15,23,42,.25);
}
.preview-story{padding:30px 34px;display:flex;flex-direction:column;color:#fff;background:radial-gradient(circle at 90% 10%,rgba(34,211,238,.22),transparent 30%),radial-gradient(circle at 10% 90%,rgba(79,70,229,.3),transparent 38%),#0f172a}
.preview-story :deep(.mc-brand-mark){align-self:flex-start;padding:6px 8px;border-radius:8px;background: var(--mc-surface)}.preview-story :deep(.mc-brand-mark img){width:125px}
.preview-copy{margin:auto 0}.preview-copy>span,.eyebrow{color:#06b6d4;font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase}.preview-copy h2{max-width:370px;margin:10px 0;font-size:27px;line-height:1.15;letter-spacing:-.8px}.preview-copy p{color:var(--mc-text);font-size:12px;line-height:1.5}
.preview-tenant{display:flex;align-items:center;gap:8px}.preview-tenant img,.preview-tenant>b{width:26px;height:26px;border-radius:6px;display:grid;place-items:center;object-fit:contain;background: var(--mc-surface);color:#2563eb}.preview-tenant div{display:flex;flex-direction:column}.preview-tenant small,.preview-copyright{color: var(--mc-muted);font-size:8px;text-transform:uppercase;letter-spacing:.5px}.preview-tenant strong{font-size:10px}.preview-copyright{margin-top:10px}
.preview-form-wrap { display:flex;align-items:center;justify-content:center;padding:40px; }
.form-inner { width: 100%; max-width: 340px; }
.form-title { font-size: 23px; font-weight: 750; color: var(--mc-ink); margin: 7px 0 4px; }
.form-sub { font-size: 12px; color: var(--mc-muted); margin: 0 0 24px; }
</style>
