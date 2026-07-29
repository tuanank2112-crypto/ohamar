<template>
  <button
    class="mc-button"
    :class="[`mc-button--${variant}`, `mc-button--${size}`]"
    :type="type"
    :disabled="disabled || loading"
  >
    <span v-if="loading" class="mc-button__spinner" aria-hidden="true" />
    <slot name="icon" />
    <slot />
  </button>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  loading?: boolean;
}>(), {
  variant: 'primary',
  size: 'md',
  type: 'button',
  disabled: false,
  loading: false,
});
</script>
