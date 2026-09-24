<script lang="ts">
  // Story 1.3 -- persistent two-tab navigation bar.
  //
  // Nav state (`activeTab`) is owned by App.svelte and passed down as a
  // value prop; `onSelect` is a callback prop, not `bind:`/`$bindable()`, so
  // App.svelte stays the single owner of nav state (unidirectional flow).
  //
  // Icons are placeholder inline SVG (no icon spec exists anywhere in the
  // UX docs or mockups -- confirmed by investigation), same convention as
  // Story 1.1's placeholder PWA icon. `stroke="currentColor"`/no fill lets
  // each icon inherit the active/inactive color from its button's own
  // `color` CSS property.
  type Tab = 'home' | 'history';

  let { activeTab, onSelect }: { activeTab: Tab; onSelect: (tab: Tab) => void } = $props();
</script>

<!-- Deliberately never made `inert`/`aria-hidden` while WorkoutDetail's
     dialog is open (Epic 2 retro finding F4, 2026-09-24 -- an earlier draft
     of that fix did this and was caught live: it silently made the tab-
     switch-closes-the-dialog interaction unreachable by click, breaking
     EXPERIENCE.md's explicit requirement that the tab bar "persists across
     both tabs; never hidden or covered by a modal" and the Story 2.1 fix
     that routes a tab switch through the same close-and-focus logic as
     Back/scrim/Escape. This bar is a deliberate exception to F4, not an
     oversight -- the day-list panels behind the scrim are the actual
     background content F4 targets. -->
<div class="tab-bar" role="tablist" aria-label="Main navigation">
  <button
    type="button"
    id="tab-home"
    role="tab"
    class="tab"
    class:active={activeTab === 'home'}
    aria-selected={activeTab === 'home'}
    aria-controls="panel-home"
    onclick={() => onSelect('home')}
  >
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10v9a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1v-9" />
    </svg>
    <span class="label">Home</span>
  </button>
  <button
    type="button"
    id="tab-history"
    role="tab"
    class="tab"
    class:active={activeTab === 'history'}
    aria-selected={activeTab === 'history'}
    aria-controls="panel-history"
    onclick={() => onSelect('history')}
  >
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M3 17 9 11l4 4 8-9" />
      <path d="M15 6h6v6" />
    </svg>
    <span class="label">History &amp; Trends</span>
  </button>
</div>

<style>
  .tab-bar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    min-height: var(--tab-bar-height);
    background: var(--surface);
    border-top: 1px solid var(--border);
    /* Standalone-installed Android PWAs can have a system gesture-nav bar
       overlapping the bottom of the viewport. This keeps the visible bar
       height constant (--tab-bar-height) and only grows the padding.
       Left/right insets are included too, for landscape orientation on
       notched/rounded-corner devices where a side cutout could otherwise
       overlap the outermost tab. */
    padding-bottom: env(safe-area-inset-bottom, 0px);
    padding-left: env(safe-area-inset-left, 0px);
    padding-right: env(safe-area-inset-right, 0px);
  }

  .tab {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    min-height: 3rem; /* 48px-equivalent minimum tap target */
    background: none;
    border: none;
    color: var(--text-secondary);
    font-family: var(--type-caption-font-family);
    font-size: var(--type-caption-size);
    font-weight: var(--type-caption-weight);
  }

  .tab.active {
    color: var(--accent-primary);
  }

  .label {
    color: inherit;
  }
</style>
