<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <!-- Login Monarch dùng bố cục hai cột; các luồng auth khác dùng khung một cột. -->
  <v-app class="auth-shell monarch-auth-shell monarch-ui">
    <v-main class="d-flex align-center justify-center" style="min-height: 100vh;">
      <slot />
    </v-main>
  </v-app>
</template>

<style scoped>
.monarch-auth-shell {
  background:
    radial-gradient(circle at 12% 12%, rgba(108, 125, 232, .16), transparent 30%),
    radial-gradient(circle at 88% 82%, rgba(139, 92, 246, .13), transparent 34%),
    #0e0d1c;
}
</style>
