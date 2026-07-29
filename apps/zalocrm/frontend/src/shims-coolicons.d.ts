import type { CoolIcon } from '@/icons/coolicons';

declare module 'vue' {
  export interface GlobalComponents {
    CoolIcon: typeof CoolIcon;
  }
}

export {};
