import { describe, expect, it } from 'vitest';
import { scrollBehavior } from '../../src/styles/motion';

describe('motion helpers', () => {
  it('scrolls without animation when matchMedia is missing', () => {
    expect(scrollBehavior()).toBe('smooth');
  });
  it('follows the reduced motion setting', () => {
    const g = globalThis as { matchMedia?: unknown };
    g.matchMedia = () => ({ matches: true });
    expect(scrollBehavior()).toBe('auto');
    delete g.matchMedia;
  });
});
