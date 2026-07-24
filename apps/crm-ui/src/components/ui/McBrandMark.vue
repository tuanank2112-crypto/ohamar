<template>
  <div class="mc-brand-mark" :class="{ compact }">
    <img src="/brand/monarch-logo.png" alt="Monarch CRM" />
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ compact?: boolean }>(), { compact: false });
</script>
