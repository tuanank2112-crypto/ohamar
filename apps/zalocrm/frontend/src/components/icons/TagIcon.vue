<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<template>
  <CoolIcon name="Tag" :size="size || 16" class="tag-icon" />
</template>

<script setup lang="ts">
defineProps<{
  size?: number | string;
}>();
</script>

<script lang="ts">
export default { name: 'TagIcon' };
</script>

<style scoped>
.tag-icon {
  display: inline-block;
  vertical-align: -2px;
  flex-shrink: 0;
}
</style>
