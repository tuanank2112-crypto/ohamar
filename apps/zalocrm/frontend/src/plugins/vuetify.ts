// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import 'vuetify/styles';
import { h } from 'vue';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';
import type { IconSet } from 'vuetify';
import { aliases as mdiAliases } from 'vuetify/iconsets/mdi';
import { CoolIcon } from '@/icons/coolicons';

const coolicons: IconSet = {
  component: (props) => h(CoolIcon, {
    name: String(props.icon ?? ''),
    size: '1em',
    class: 'v-icon__svg',
  }),
};

/** Monarch CRM dark theme. Page-level legacy classes consume compatibility
 * tokens from monarch.css while their business logic remains unchanged. */
export const vuetify = createVuetify({
  components,
  directives,
  icons: {
    defaultSet: 'coolicons',
    aliases: mdiAliases,
    sets: { coolicons },
  },
  theme: {
    defaultTheme: 'monarchDark',
    themes: {
      monarchDark: {
        dark: true,
        colors: {
          primary: '#6C7DE8',
          'primary-darken-1': '#5B6AD4',
          secondary: '#8B5CF6',
          accent: '#AEB7FF',
          background: '#0E0D1C',
          surface: '#1C1B32',
          'surface-variant': '#252440',
          success: '#34D399',
          warning: '#FBBF24',
          error: '#F87171',
          info: '#60A5FA',
          'on-surface': '#DDDDF0',
          'on-background': '#DDDDF0',
          'on-primary': '#FFFFFF',
        },
        variables: {
          'border-color': '#FFFFFF',
          'border-opacity': 0.08,
          'high-emphasis-opacity': 1,
          'medium-emphasis-opacity': 0.72,
          'theme-radius': '8px',
        },
      },
    },
  },
  defaults: {
    // Compact defaults for data-heavy CRM screens.
    VBtn: { variant: 'flat', rounded: 'md', style: 'text-transform:none;letter-spacing:0;' },
    VTextField: { variant: 'outlined', density: 'compact' },
    VSelect: { variant: 'outlined', density: 'compact' },
    VAutocomplete: { variant: 'outlined', density: 'compact' },
    VTextarea: { variant: 'outlined', density: 'compact' },
    VCard: { rounded: 'lg', variant: 'flat' },
    VChip: { rounded: 'pill', size: 'small' },
    VDialog: { maxWidth: 600 },
  },
});

/* Shared domain presentation helpers. */
export function scoreLevel(score: number): 'zero' | 'low' | 'mid' | 'high' {
  if (score === 0) return 'zero';
  if (score < 40) return 'low';
  if (score < 70) return 'mid';
  return 'high';
}
export const SCORE_COLORS = {
  zero: { bg: '#252440', fg: '#8d8cb0' },
  low: { bg: 'rgba(251,191,36,.15)', fg: '#fbbf24' },
  mid: { bg: 'rgba(108,125,232,.16)', fg: '#aeb7ff' },
  high: { bg: 'rgba(52,211,153,.15)', fg: '#34d399' },
} as const;
export const REL_KIND = {
  friend: { label: 'Đã kết bạn', dot: '#34d399', bg: 'rgba(52,211,153,.15)', fg: '#34d399' },
  pending_friend: { label: 'Đã gửi mời', dot: '#fbbf24', bg: 'rgba(251,191,36,.15)', fg: '#fbbf24' },
  chatting_stranger: { label: 'Đang nhắn lạ', dot: '#6c7de8', bg: 'rgba(108,125,232,.16)', fg: '#aeb7ff' },
  ghost: { label: 'Đã ngắt', dot: '#8d8cb0', bg: '#252440', fg: '#a5a4c4' },
} as const;
