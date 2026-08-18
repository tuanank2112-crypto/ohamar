<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Community stub — automation blocks panel in chat (open-core). Renders nothing. -->
<template>
  <span />
</template>

<script setup lang="ts">
defineProps<{
  conversationId: string | null;
  contact?: unknown;
  ownerNickId?: string | null;
  nickName?: string | null;
}>();
</script>
