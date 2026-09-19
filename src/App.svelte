<script lang="ts">
  // Story 1.3 -- two-tab navigation shell. Day-List rendering (1.5) and
  // History & Trends content (Epic 3) are out of this story's scope --
  // each tab's content area is an empty/placeholder panel only.
  //
  // Story 1.4 -- Home's placeholder panel is now gated on the Plan Data
  // Store's status (skeleton / loaded / error) rather than always shown.
  // Actual day-by-day rendering is still Story 1.5's job -- the 'loaded'
  // branch below keeps today's existing placeholder paragraph.
  import { untrack } from 'svelte';
  import TabBar from './lib/components/TabBar.svelte';
  import SkeletonDayRow from './lib/components/SkeletonDayRow.svelte';
  import { planStore, loadPlan } from './lib/data/planStore.svelte';

  type Tab = 'home' | 'history';

  let activeTab = $state<Tab>('home');

  function handleSelect(tab: Tab) {
    // Re-tap-to-reset (EXPERIENCE.md) is intentionally not implemented here
    // -- there is no real Home/History content yet for "reset" to act on.
    // A later story can add that behavior on top of this handler.
    activeTab = tab;
  }

  // Guards the Retry button against rapid repeat taps. Deliberately a
  // separate flag from `planStore.status` rather than checking
  // `planStore.status === 'loading'` directly: the Retry button only ever
  // renders while `status === 'error'`, so TypeScript correctly narrows
  // `status` to the literal `'error'` inside that branch and flags a
  // `status === 'loading'` comparison there as always-false (and in
  // practice the branch swaps away to the skeleton the moment `loadPlan`
  // flips status to `'loading'` anyway, before this flag would even
  // matter for anything but the brief window prior to that reactive
  // update). This is a nicety, not a correctness fix -- planStore's own
  // `status === 'loading'` guard already prevents a slow concurrent retry
  // from clobbering a faster one's success.
  let retrying = $state(false);

  async function handleRetry() {
    retrying = true;
    try {
      await loadPlan();
    } finally {
      retrying = false;
    }
  }

  // Fired once on mount. Reads a cache hit for an instant paint (if one
  // exists), then always runs a background network refetch -- see
  // planStore.svelte.ts for the full cache-read/cache-busted-refetch flow.
  //
  // `untrack` matters here: `loadPlan()`'s synchronous prefix (before its
  // first `await`) reads `planStore.status`, and reads that happen
  // synchronously inside an `$effect` are tracked as that effect's
  // dependencies even several function calls deep. Without `untrack`, this
  // effect would end up depending on `planStore.status` and re-fire itself
  // every time `loadPlan()` later changes it -- re-running on every
  // loading/loaded/error transition instead of once on mount as intended.
  $effect(() => {
    untrack(loadPlan);
  });
</script>

<main>
  <!-- Screen-reader-only heading: the app has no other page-level heading
       now that the tab shell replaced the old static <h1>, and installed
       standalone PWAs show no browser chrome/title to compensate. Not a
       design token -- the visually-hidden technique intentionally uses
       literal 1px offsets, not app.css's rem-based tokens. -->
  <h1 class="visually-hidden">Training Journal</h1>
  <!-- `<div>`, not `<section>`: `<section>`'s implicit landmark role
       conflicts with the explicit `role="tabpanel"` (Svelte a11y lint flags
       "non-interactive element to interactive role"); each panel's
       accessible name comes from `aria-labelledby` pointing at its tab.

       Both panels stay mounted and are toggled via `hidden` rather than a
       `{#if}/{:else}` that removes the inactive one from the DOM -- a
       review found that conditionally unmounting a panel makes its tab's
       `aria-controls` reference a nonexistent id whenever that tab isn't
       active, which is invalid per the WAI-ARIA Tabs pattern. `tabindex="0"`
       lets keyboard users move focus directly into a panel after selecting
       its tab, per the same authoring practice. -->
  <div id="panel-home" role="tabpanel" aria-labelledby="tab-home" tabindex="0" hidden={activeTab !== 'home'}>
    {#if planStore.status === 'loading'}
      <!-- Cold load, nothing cached yet: skeleton day-row placeholders,
           never a spinner (I/O matrix). SkeletonDayRow's own root is
           aria-hidden (it's a visual approximation, not real content), so
           without this separate visually-hidden live-region text a
           screen-reader user would get no indication anything is loading at
           all until the panel happened to resolve. -->
      <div class="skeleton-list">
        <span class="visually-hidden" aria-live="polite">Loading your plan…</span>
        {#each Array.from({ length: 5 }) as _, i (i)}
          <SkeletonDayRow />
        {/each}
      </div>
    {:else if planStore.status === 'error'}
      <!-- Cold load, fetch failed, nothing cached: plain-voice failure
           message plus a manual Retry that re-runs the same fetch path.
           `role="alert"` gives this an implicit assertive live region so a
           screen-reader user is told about the failure as soon as it
           replaces the skeleton, without needing to already be focused
           inside this panel. `disabled` while a retry is already in flight
           is a trivial guard against redundant concurrent fetches from
           rapid repeat taps -- the existing `status === 'loading'` check in
           planStore already prevents a slow concurrent call from clobbering
           a faster one's success, so this is a nicety, not a correctness
           fix. -->
      <div class="plan-error" role="alert">
        <p>Couldn't load your plan — check your connection and try again</p>
        <button type="button" class="retry-button" onclick={handleRetry} disabled={retrying}>
          Retry
        </button>
      </div>
    {:else}
      <p>Home placeholder -- Day-List rendering arrives in Story 1.5.</p>
    {/if}
  </div>
  <div id="panel-history" role="tabpanel" aria-labelledby="tab-history" tabindex="0" hidden={activeTab !== 'history'}>
    <p>History &amp; Trends placeholder -- content arrives in Epic 3.</p>
  </div>
</main>

<TabBar {activeTab} onSelect={handleSelect} />

<style>
  main {
    background: var(--background);
    color: var(--text-primary);
    padding: var(--space-7);
    /* Adds the Android gesture-nav safe-area inset (0 unless index.html's
       viewport-fit=cover is honored) on top of the tab bar's own height, so
       content never renders under a bar that has grown taller than
       --tab-bar-height to accommodate that inset -- see TabBar.svelte's
       matching padding-bottom. */
    padding-bottom: calc(var(--tab-bar-height) + env(safe-area-inset-bottom, 0px));
  }

  p {
    font-family: var(--type-body-font-family);
    font-size: var(--type-body-size);
    font-weight: var(--type-body-weight);
    line-height: var(--type-body-line-height);
  }

  .skeleton-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .plan-error {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-6);
  }

  .retry-button {
    min-height: 3rem; /* epic's tap-target floor */
    padding: var(--space-4) var(--space-7);
    border: none;
    border-radius: var(--radius-sm);
    background: var(--accent-primary);
    color: var(--surface);
    font-family: var(--type-body-font-family);
    /* Deliberate mix, not a copy-paste slip: --type-body-size (no named
       role is sized for a one-off button label) paired with
       --type-title-weight so the label reads as clearly actionable against
       --accent-primary, rather than inventing a new typography role for a
       single button -- the same kind of judgment call as Story 1.3's
       documented --type-caption choice for the tab labels. */
    font-size: var(--type-body-size);
    font-weight: var(--type-title-weight);
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
