import { describe, expect, it } from 'vitest';
import { prefersReducedMotion } from './use-gsap-motion';

describe('prefersReducedMotion', () => {
  it('is false without browser media query support', () => {
    expect(prefersReducedMotion()).toBe(false);
  });
});
