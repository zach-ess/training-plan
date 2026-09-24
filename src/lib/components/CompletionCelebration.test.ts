// Epic 2 retro (2026-09-24), finding F2 / action item 8 (test-harness
// decision): regression coverage for the specific bug class this retro
// found -- a completely silent failure (zero console/page errors) that
// slipped past two dedicated rounds of per-story code review, and only
// surfaced via a whole-epic retrospective's live-browser verification. See
// _bmad-output/implementation-artifacts/epic-2-retro-2026-09-24.md.
//
// What actually happened, live-verified in that retro: navigator.vibrate(40)
// was guarded against an *absent* Vibration API (typeof === 'function'), but
// not against a *present* implementation that throws when called (e.g.
// blocked by a permissions policy). An uncaught throw there propagated out
// of this component's mount effect entirely -- Svelte doesn't contain it
// locally -- and tripped Story 1.6's top-level error boundary, crashing the
// whole app to CrashFallback over what should be a best-effort haptic pulse.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/svelte';
import CompletionCelebration from './CompletionCelebration.svelte';

describe('CompletionCelebration', () => {
  afterEach(() => {
    vi.useRealTimers();
    // @ts-expect-error -- test-only cleanup of a property tests define below
    delete navigator.vibrate;
  });

  it('F2: still calls onSettled when navigator.vibrate() throws, instead of the mount effect dying uncaught', async () => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: () => {
        throw new DOMException('vibrate blocked (simulated)', 'NotAllowedError');
      },
    });

    const onSettled = vi.fn();
    // If the throw were still uncaught here, it would propagate out of
    // Svelte's effect scheduler on the next flush rather than out of this
    // render() call directly -- letting fake timers advance below is what
    // actually exercises that path, not this render() resolving cleanly.
    render(CompletionCelebration, { props: { onSettled } });

    // Reduced-motion SETTLE_MS is 700ms (vitest.setup.ts stubs matchMedia to
    // report reduced motion); advance well past it.
    await vi.advanceTimersByTimeAsync(1000);

    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('sanity: calls onSettled once under normal conditions (no throw)', async () => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vi.fn() });

    const onSettled = vi.fn();
    render(CompletionCelebration, { props: { onSettled } });
    await vi.advanceTimersByTimeAsync(1000);

    expect(onSettled).toHaveBeenCalledTimes(1);
  });
});
