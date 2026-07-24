import { onMounted, onUnmounted, type Ref } from 'vue';
import { gsap } from 'gsap';

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function useGsapMotion(
  root: Ref<HTMLElement | null>,
  setup: (api: typeof gsap, rootEl: HTMLElement) => void | (() => void),
) {
  let ctx: ReturnType<typeof gsap.context> | undefined;
  let cleanup: void | (() => void);

  onMounted(() => {
    if (!root.value || prefersReducedMotion()) return;
    ctx = gsap.context(() => {
      cleanup = setup(gsap, root.value as HTMLElement);
    }, root.value);
  });

  onUnmounted(() => {
    cleanup?.();
    ctx?.revert();
  });
}
