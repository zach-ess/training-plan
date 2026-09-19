<script lang="ts">
  // Story 1.3 -- two-tab navigation shell. Day-List rendering (1.5) and
  // History & Trends content (Epic 3) are out of this story's scope --
  // each tab's content area is an empty/placeholder panel only.
  import TabBar from './lib/components/TabBar.svelte';

  type Tab = 'home' | 'history';

  let activeTab = $state<Tab>('home');

  function handleSelect(tab: Tab) {
    // Re-tap-to-reset (EXPERIENCE.md) is intentionally not implemented here
    // -- there is no real Home/History content yet for "reset" to act on.
    // A later story can add that behavior on top of this handler.
    activeTab = tab;
  }
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
    <p>Home placeholder -- Day-List rendering arrives in Story 1.5.</p>
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
