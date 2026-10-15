// Epic 4 retro A7 -- the shared `prefers-reduced-motion` read.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { prefersReducedMotion } from './motion';

const originalMatchMedia = window.matchMedia;

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

function stubMatchMedia(matches: boolean) {
  const matchMedia = vi.fn((query: string) => ({ matches, media: query }));
  window.matchMedia = matchMedia as unknown as typeof window.matchMedia;
  return matchMedia;
}

describe('prefersReducedMotion', () => {
  it('asks for exactly the reduced-motion query and returns its answer', () => {
    const matchMedia = stubMatchMedia(true);
    expect(prefersReducedMotion()).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');

    stubMatchMedia(false);
    expect(prefersReducedMotion()).toBe(false);
  });

  it('is false when matchMedia is unavailable', () => {
    window.matchMedia = undefined as unknown as typeof window.matchMedia;
    expect(prefersReducedMotion()).toBe(false);
  });

  // The `typeof window === 'undefined'` guard can't be exercised under
  // jsdom, where `window` always exists.
});
