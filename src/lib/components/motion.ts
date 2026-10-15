// Epic 4 retro A7 (deferred from Story 4.2) -- the one `prefers-reduced-motion`
// read, shared by App.svelte's tab reset and CompletionCelebration. A View
// concern (it reads the browser, not app data), so it lives beside the
// components rather than in `domain/`. Callers choose when to read it: App
// reads at tap time, CompletionCelebration once at mount.

/** True when the OS asks for reduced motion. False wherever `matchMedia`
 * isn't available, so a missing API never blocks an animation path. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
