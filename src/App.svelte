<script lang="ts">
  // Story 1.3 -- two-tab navigation shell. History & Trends content (Epic 3)
  // is out of this story's scope -- that tab's content area is still an
  // empty/placeholder panel only.
  //
  // Story 1.4 -- Home's placeholder panel is gated on the Plan Data Store's
  // status (skeleton / loaded / error) rather than always shown.
  //
  // Story 1.5 -- the 'loaded' branch now renders a real day list (one
  // `DayRowCard` per date across the Plan's span, always including today)
  // instead of the placeholder paragraph the previous two stories left
  // there.
  import { tick, untrack } from 'svelte';
  import TabBar from './lib/components/TabBar.svelte';
  import SkeletonDayRow from './lib/components/SkeletonDayRow.svelte';
  import DayRowCard from './lib/components/DayRowCard.svelte';
  import WorkoutDetail from './lib/components/WorkoutDetail.svelte';
  import { planStore, loadPlan } from './lib/data/planStore.svelte';
  import { parsePlan } from './lib/domain/parsePlan';
  import { getPlanDayRange } from './lib/domain/getPlanDayRange';
  import { getTodayIso } from './lib/domain/date';

  type Tab = 'home' | 'history';

  let activeTab = $state<Tab>('home');

  // Story 2.1 -- which date's Workout Detail is open, if any. An overlay
  // flag, not a route: opening/closing it never touches `activeTab`,
  // `dayRange`, or scroll position (this story's Boundaries).
  let selectedDate = $state<string | null>(null);

  function handleOpenDetail(date: string) {
    selectedDate = date;
  }

  // `skipFocusRestore` -- set by `handleSelect` below when it's closing the
  // dialog as a *side effect* of switching tabs (Epic 2 retro finding F1):
  // in that case the row this function would normally refocus is Home's,
  // but Home is about to become the *inactive* tab, so refocusing it would
  // either no-op against an already-hidden element or leave focus somewhere
  // the user just navigated away from. `handleSelect` restores focus into
  // the tab actually being switched to instead.
  function handleCloseDetail(options?: { skipFocusRestore?: boolean }) {
    // Read before clearing -- the row to refocus is the one that was open.
    const closedDate = selectedDate;
    selectedDate = null;
    if (options?.skipFocusRestore) {
      return;
    }
    // Mirrors `scrollToToday`'s existing query-selector convention. The day
    // list stays mounted the whole time this dialog is open (Boundaries), so
    // the row is normally still there to refocus -- but if a background
    // refetch or a `dayRange` window rollover removed/hid that date's row
    // while the dialog was open, fall back to the Home panel's own
    // container (already a real focus target via its `tabindex="0"`) rather
    // than silently dropping focus to `<body>`.
    if (closedDate) {
      const row = document.querySelector<HTMLElement>(`[data-date="${closedDate}"]`);
      if (row) {
        row.focus();
      } else {
        document.getElementById('panel-home')?.focus();
      }
    }
  }

  // Computed once, not re-derived reactively -- the Never section is
  // explicit that "today" never live-recomputes while the app stays open
  // across a midnight rollover, and this value has no reactive dependencies
  // of its own to ever trigger a re-run anyway.
  const todayIso = getTodayIso();

  // Story 1.5 -- turns Story 1.4's opaque `planStore.plan` into the ordered
  // list of dates Home renders, plus a same-date Workout lookup for each.
  // Both are `$derived` so a background refetch that silently updates
  // `planStore.plan` (I/O matrix: "Background refetch updates Plan while
  // already 'loaded'") re-renders these rows in place with no re-mount.
  const plan = $derived(parsePlan(planStore.plan));
  const dayRange = $derived(getPlanDayRange(plan.workouts, todayIso));
  // Built from `plan.workouts` in array order so a later duplicate entry for
  // the same date overwrites an earlier one in the map -- "the later array
  // entry wins for that date" (I/O matrix).
  const workoutsByDate = $derived(new Map(plan.workouts.map((workout) => [workout.date, workout])));

  // Scrolls today's row into view once, right after the 'loaded' panel's day
  // list first mounts -- never re-fired by a later reactive update within
  // the same mount (e.g. a background refetch), since a Svelte action's
  // function body only runs on mount/unmount, not on every dependency
  // change the way `$effect` would.
  function scrollToToday(node: HTMLElement) {
    node.querySelector('[data-today="true"]')?.scrollIntoView({ block: 'center' });
  }

  function handleSelect(tab: Tab) {
    // Re-tap-to-reset (EXPERIENCE.md) is intentionally not implemented here
    // -- there is no real Home/History content yet for "reset" to act on.
    // A later story can add that behavior on top of this handler.
    activeTab = tab;
    // The WorkoutDetail scrim deliberately stops short of covering the tab
    // bar (EXPERIENCE.md: it "persists across both tabs; never hidden or
    // covered by a modal"), so without this a tab switch would leave the
    // dialog open on top of whichever tab is now active. Closing it here
    // keeps it from ever persisting across a tab change.
    //
    // Routed through `handleCloseDetail()` (Spec Change Log, 2026-09-22),
    // not a bare `selectedDate = null`, so this 4th close trigger runs
    // consistent cleanup with Back/scrim/Escape. `skipFocusRestore: true`
    // (Epic 2 retro, finding F1) because by this point `activeTab` above
    // has already flipped, so Home's row -- the target `handleCloseDetail`
    // would normally refocus -- is already `hidden`; `.focus()` on a hidden
    // element silently no-ops per the HTML spec, and since the row element
    // itself is still found (not null), `handleCloseDetail`'s own
    // `panel-home` fallback is never reached either, so focus dropped to
    // `<body>` with no console/page error to reveal it. Restoring focus
    // into the tab the user is actually switching to, below, is also the
    // more correct target regardless -- there is no reason to send focus
    // back into a panel the user just navigated away from.
    if (selectedDate) {
      handleCloseDetail({ skipFocusRestore: true });
      // `tick()` first: `activeTab = tab` above hasn't flushed to the DOM
      // yet at this point in the same synchronous handler, so `panel-${tab}`
      // is still `hidden` here -- focusing it immediately would silently
      // no-op exactly like the bug this fix addresses (verified live while
      // building this fix). Deferring past the flush is what actually
      // lands focus in the newly-visible panel instead of leaving it
      // wherever the native click-to-focus behavior happened to put it.
      tick().then(() => {
        document.getElementById(`panel-${tab}`)?.focus();
      });
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
           inside this panel. No local in-flight guard is needed on this
           button itself -- rapid repeat taps are guarded inside
           `loadPlan()` (planStore.svelte.ts) rather than here, since a
           button-local flag can't actually protect anything: the moment
           `loadPlan()` flips `status` away from `'error'`, this whole
           branch unmounts (including the button), before any second click
           could land on it anyway. -->
      <div class="plan-error" role="alert">
        <p>Couldn't load your plan — check your connection and try again</p>
        <button type="button" class="retry-button" onclick={loadPlan}>Retry</button>
      </div>
    {:else}
      <div class="day-list" use:scrollToToday>
        {#each dayRange as date (date)}
          <DayRowCard
            {date}
            workout={workoutsByDate.get(date)}
            isToday={date === todayIso}
            onOpen={handleOpenDetail}
          />
        {/each}
      </div>
    {/if}
  </div>
  <div id="panel-history" role="tabpanel" aria-labelledby="tab-history" tabindex="0" hidden={activeTab !== 'history'}>
    <p>History &amp; Trends placeholder -- content arrives in Epic 3.</p>
  </div>
  {#key selectedDate}
    {#if selectedDate}
      <WorkoutDetail
        date={selectedDate}
        workout={workoutsByDate.get(selectedDate)}
        onClose={handleCloseDetail}
      />
    {/if}
  {/key}
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

  .day-list {
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--border);
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
