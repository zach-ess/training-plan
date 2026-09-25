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
  //
  // Story 3.1 -- `#panel-history`'s own placeholder paragraph is replaced by
  // `<HistoryView>`, which does its own day-list rendering/loading/error
  // composition internally (see HistoryView.svelte) -- this file only wires
  // its `onOpen` prop to the same `handleOpenDetail` Home already uses.
  import { tick, untrack } from 'svelte';
  import TabBar from './lib/components/TabBar.svelte';
  import SkeletonDayRow from './lib/components/SkeletonDayRow.svelte';
  import DayRowCard from './lib/components/DayRowCard.svelte';
  import WorkoutDetail from './lib/components/WorkoutDetail.svelte';
  import StreakIndicator from './lib/components/StreakIndicator.svelte';
  import HistoryView from './lib/components/HistoryView.svelte';
  import WeekEndReview from './lib/components/WeekEndReview.svelte';
  import { planStore, loadPlan } from './lib/data/planStore.svelte';
  import { logStore } from './lib/data/logStore.svelte';
  import { weekEndReviewStore } from './lib/data/weekEndReviewStore.svelte';
  import { parsePlan } from './lib/domain/parsePlan';
  import { getPlanDayRange } from './lib/domain/getPlanDayRange';
  import { computeStreak } from './lib/domain/computeStreak';
  import { getTodayIso, getWeekStartIso } from './lib/domain/date';

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
    //
    // Story 3.3 review fix: scoped to `#panel-${activeTab}`, not a bare
    // document-wide `[data-date="..."]` selector -- since Story 3.1,
    // HistoryView's own day list renders a row for the exact same dates
    // (the full Plan day range), and Workout Detail can be opened from
    // either tab's list via this same handler. Home's `#panel-home` is
    // always declared first in the DOM, so an unscoped selector would match
    // Home's *hidden* row first whenever this dialog was opened from
    // History, and `.focus()` on a hidden element silently no-ops (the same
    // hazard `skipFocusRestore`/Epic 2 retro finding F1 already guards
    // against elsewhere in this file) -- dropping focus to `<body>` instead
    // of back into the row the user actually tapped.
    if (closedDate) {
      const row = document.querySelector<HTMLElement>(
        `#panel-${activeTab} [data-date="${closedDate}"]`,
      );
      if (row) {
        row.focus();
      } else {
        document.getElementById(`panel-${activeTab}`)?.focus();
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

  // Story 2.4 -- the running Streak (FR-8), recomputed from `logStore.entries`
  // directly (not a snapshot/callback) -- `$derived` picks up a later
  // successful `setCompleted`/`replaceLogEntry` write the moment it
  // reassigns `logStore.entries`, the same reactive mechanism `WorkoutDetail`
  // already relies on for its own `dayView` (AC5: recomputes "in the same
  // moment as Completion Feedback," with no explicit event/callback wiring).
  const streak = $derived(computeStreak(dayRange, workoutsByDate, logStore.entries, todayIso));

  // Story 3.3 -- Week-End Review. `todayWeekStartIso` is computed once, not
  // re-derived reactively (mirrors `todayIso`'s own "today never
  // live-recomputes" convention above) -- if `todayWeekStartIso === todayIso`,
  // today itself is that week's Sunday. This is the same equality
  // `getWeekStartIso` already guarantees for a Sunday input (a Sunday's own
  // week starts on itself), so it doubles as this app's one "is today
  // Sunday" test without a separate day-of-week check.
  const todayWeekStartIso = getWeekStartIso(todayIso);
  const isSundayToday = todayWeekStartIso === todayIso;

  // Banner gate (this story's Always section): a real Plan loaded (the
  // dialog needs its day range), today is that week's own Sunday, and no
  // WeekEndReview has been saved for it yet. `$derived` off
  // `weekEndReviewStore.reviews` so a successful Save (which reassigns that
  // object wholesale) drops the banner in the same render, with no separate
  // event wiring (AC7).
  const showWeekEndReviewBanner = $derived(
    planStore.status === 'loaded' &&
      isSundayToday &&
      weekEndReviewStore.reviews[todayWeekStartIso] === undefined,
  );

  // Which week's Review dialog is open, if any, and whether it's read-only
  // (a saved week, opened from a History row) or the live/editable one (only
  // ever the current week, opened from the banner). An overlay flag, same
  // convention as `selectedDate` above -- opening/closing it never touches
  // `activeTab`/`dayRange`/scroll position.
  let reviewDialog = $state<{ weekStartIso: string; readOnly: boolean } | null>(null);

  function handleOpenReviewBanner() {
    reviewDialog = { weekStartIso: todayWeekStartIso, readOnly: false };
  }

  // Passed to HistoryView as `onOpenReview` -- called only for a Sunday row
  // whose week already has a saved Review (this story's Decisions), so
  // `readOnly` is always `true` here; the live/editable dialog is only ever
  // reachable via the banner above.
  function handleOpenReview(weekStartIso: string) {
    reviewDialog = { weekStartIso, readOnly: true };
  }

  function handleCloseReview() {
    const closedWeekStartIso = reviewDialog?.weekStartIso;
    reviewDialog = null;
    if (closedWeekStartIso) {
      // Mirrors `handleCloseDetail`'s own query-selector convention (and its
      // review-fix scoping, above): refocus the row/banner that opened this,
      // falling back to whichever tab panel is actually active right now if
      // it's no longer there to refocus (e.g. a successful Save just dropped
      // the banner it was opened from). Scoped to `#panel-${activeTab}`, not
      // a bare document-wide selector -- a saved week's Sunday date exists
      // as a row in *both* Home's and History's day lists (both span the
      // full Plan day range), and Home's markup is always declared first in
      // the DOM, so an unscoped selector would match Home's hidden row first
      // when this dialog was opened from a History row, silently dropping
      // focus instead of returning it to the tapped row.
      const row = document.querySelector<HTMLElement>(
        `#panel-${activeTab} [data-date="${closedWeekStartIso}"]`,
      );
      if (row) {
        row.focus();
      } else {
        document.getElementById(`panel-${activeTab}`)?.focus();
      }
    }
  }

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
    let closedAModal = false;
    if (selectedDate) {
      handleCloseDetail({ skipFocusRestore: true });
      closedAModal = true;
    }
    // Story 3.3 -- the Week-End Review dialog is the same kind of
    // scrim-stops-short-of-the-tab-bar overlay as WorkoutDetail (this
    // story's Boundaries: "mirrors WorkoutDetail.svelte exactly"), so a tab
    // switch must close it too rather than leaving it open behind the
    // now-active tab. A bare `reviewDialog = null` here (not routed through
    // `handleCloseReview`) is deliberate: that function's own row/banner
    // refocus logic targets the panel being switched *away* from, the exact
    // same hazard `skipFocusRestore` guards against for `handleCloseDetail`
    // above -- the `tick().then(...)` below already restores focus into the
    // tab actually being switched to.
    if (reviewDialog) {
      reviewDialog = null;
      closedAModal = true;
    }
    if (closedAModal) {
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
  <!-- `inert`/`aria-hidden` while WorkoutDetail's modal dialog is open
       (Epic 2 retro finding F4, 2026-09-24): both panels stay mounted and
       visible-or-hidden purely by tab selection (Boundaries), independent
       of the dialog -- so without this, the currently-active panel remains
       a reachable, focusable background control behind the dialog's scrim,
       which `aria-modal="true"` alone doesn't reliably prevent in every
       engine. `hidden` already covers the *inactive* panel; this covers
       the *active* one too, for as long as the dialog is open. -->
  <div
    id="panel-home"
    role="tabpanel"
    aria-labelledby="tab-home"
    tabindex="0"
    hidden={activeTab !== 'home'}
    inert={selectedDate !== null || reviewDialog !== null}
    aria-hidden={selectedDate !== null || reviewDialog !== null}
  >
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
      <StreakIndicator {streak} />
      <!-- Story 3.3 -- Sunday-only, non-dismissible: no close/dismiss control
           exists anywhere on this banner (this story's I/O matrix: "Try to
           dismiss banner unopened -- No dismiss action exists") -- tapping
           it is the only interaction it offers, and that interaction opens
           the Review rather than dismissing anything. -->
      {#if showWeekEndReviewBanner}
        <button
          type="button"
          id="week-end-review-banner"
          class="week-end-review-banner"
          onclick={handleOpenReviewBanner}
        >
          Review your week
        </button>
      {/if}
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
  <div
    id="panel-history"
    role="tabpanel"
    aria-labelledby="tab-history"
    tabindex="0"
    hidden={activeTab !== 'history'}
    inert={selectedDate !== null || reviewDialog !== null}
    aria-hidden={selectedDate !== null || reviewDialog !== null}
  >
    <!-- Story 3.1 -- HistoryView turned out not to need `plan`/`todayIso`
         threaded in as props at all: it reads `planStore.plan`/`getTodayIso()`
         itself, the same way App.svelte does, so `onOpen` is the only prop
         passed. This `#panel-history`'s own `id`/`hidden`/`inert`/
         `aria-hidden` wiring above is untouched -- only this child markup
         changed.
         Story 3.3 -- `onOpenReview` is the second prop: HistoryView itself
         decides, per row, whether a Sunday's saved Review routes there
         instead of `onOpen`/WorkoutDetail (this story's Decisions) -- App.svelte
         stays the sole owner of the resulting `reviewDialog` state, same as
         `selectedDate` above. -->
    <HistoryView onOpen={handleOpenDetail} onOpenReview={handleOpenReview} />
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
  {#key reviewDialog ? `${reviewDialog.weekStartIso}:${reviewDialog.readOnly}` : null}
    {#if reviewDialog}
      <WeekEndReview
        weekStartIso={reviewDialog.weekStartIso}
        readOnly={reviewDialog.readOnly}
        onClose={handleCloseReview}
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

  /* Story 3.3 -- Sunday-only Week-End Review banner. A real
     `<button type="button">` (this app's established "no bare clickable
     div" convention -- checkDayRowCardWiring/checkCrashFallbackWiring apply
     the same rule to their own components), styled to read as a prompt
     rather than a plain row: --accent-primary background, same shape as
     `.retry-button` above. */
  .week-end-review-banner {
    all: unset;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: 3rem; /* epic's tap-target floor */
    margin-bottom: var(--space-6);
    padding: var(--space-4) var(--space-7);
    border-radius: var(--radius-sm);
    cursor: pointer;
    text-align: center;
    background: var(--accent-primary);
    color: var(--surface);
    font-family: var(--type-row-label-font-family);
    font-size: var(--type-row-label-size);
    font-weight: var(--type-row-label-weight);
  }

  .week-end-review-banner:focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: 2px;
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
