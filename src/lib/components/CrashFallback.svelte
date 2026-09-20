<!--
  Story 1.6 -- CrashFallback: the single shared fallback UI rendered by
  Root.svelte's two independent catch paths (`<svelte:boundary>`'s `failed`
  snippet, and the global `window` error/unhandledrejection listeners) when
  an unhandled exception occurs anywhere in the app (AD-10).

  Deliberately inert: no props, no store reads, no dynamic content --
  static markup only, so this component itself cannot throw and leave
  nothing to recover with. `role="alert"` gives it an implicit assertive
  live region so a screen-reader user is told immediately, without needing
  to already be focused here (same reasoning as App.svelte's existing
  `.plan-error` panel). No telemetry, logging, or error detail of any kind
  is ever surfaced or sent anywhere (AD-10, Consistency Conventions'
  no-telemetry rule) -- this message is the only signal.

  The Reload button calls `window.location.reload()` directly (a full page
  reload), not `<svelte:boundary>`'s `reset()` -- see this story's spec
  Design Notes for why an in-place resume is deliberately avoided.
-->
<div class="crash-fallback" role="alert">
  <p>Something went wrong — reload to try again</p>
  <button type="button" class="reload-button" onclick={() => window.location.reload()}>Reload</button>
</div>

<style>
  .crash-fallback {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-6);
    min-height: 100vh;
    padding: var(--space-7);
    background: var(--background);
    color: var(--text-primary);
  }

  p {
    font-family: var(--type-body-font-family);
    font-size: var(--type-body-size);
    font-weight: var(--type-body-weight);
    line-height: var(--type-body-line-height);
  }

  .reload-button {
    min-height: 3rem; /* epic's tap-target floor */
    padding: var(--space-4) var(--space-7);
    border: none;
    border-radius: var(--radius-sm);
    background: var(--accent-primary);
    color: var(--surface);
    font-family: var(--type-body-font-family);
    /* Same deliberate --type-body-size/--type-title-weight mix as
       App.svelte's .retry-button -- see that component's comment for why. */
    font-size: var(--type-body-size);
    font-weight: var(--type-title-weight);
  }
</style>
