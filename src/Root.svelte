<!--
  Story 1.6 -- Top-Level Error Boundary. This is the new mount point (see
  main.ts): it wraps `<App />` in Svelte 5's `<svelte:boundary>` (catches
  exceptions thrown while rendering/updating the tree, or inside an
  `$effect`) and layers a second, independent catch path on top -- `window`
  `error`/`unhandledrejection` listeners -- for everything a component
  boundary can't see: a synchronous throw inside a DOM event handler, a
  timer callback, or a stray unhandled promise rejection anywhere in the
  app. Both paths render the exact same `CrashFallback`.

  `globalCrash` deliberately short-circuits past the boundary entirely
  (rather than nesting) once true: a global JS error can leave the whole
  document in an unknown state, so once caught this replaces the entire UI
  (including the tab bar) with the fallback, same as the boundary's `failed`
  snippet does for its own catch path.
-->
<script lang="ts">
  import App from './App.svelte';
  import CrashFallback from './lib/components/CrashFallback.svelte';

  let globalCrash = $state(false);

  // Registered once on mount, cleaned up on unmount (Root never actually
  // unmounts in practice -- it's the app's permanent mount root -- but the
  // cleanup keeps this effect well-behaved regardless). Deliberately does
  // not inspect the ErrorEvent/PromiseRejectionEvent's error detail or send
  // it anywhere -- AD-10 and the Consistency Conventions' no-telemetry rule
  // both rule that out; the only thing this handler does is flip the flag
  // that swaps in the fallback.
  $effect(() => {
    function handleGlobalError() {
      globalCrash = true;
    }

    window.addEventListener('error', handleGlobalError);
    window.addEventListener('unhandledrejection', handleGlobalError);

    return () => {
      window.removeEventListener('error', handleGlobalError);
      window.removeEventListener('unhandledrejection', handleGlobalError);
    };
  });
</script>

{#if globalCrash}
  <CrashFallback />
{:else}
  <svelte:boundary>
    <App />

    {#snippet failed()}
      <CrashFallback />
    {/snippet}
  </svelte:boundary>
{/if}
