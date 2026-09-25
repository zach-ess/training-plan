<script lang="ts">
  // Story 3.1 -- History & Trends Day List.
  //
  // Pure composition over pieces every prior story already built (AD-8: "no
  // separate day-state merge logic written for History") -- mirrors
  // App.svelte's own `plan`/`dayRange`/`workoutsByDate` `$derived` pattern
  // exactly, reading the same `planStore.plan` Data Store App.svelte already
  // reads (Never section: no new access path) so a background Plan refetch
  // re-renders these rows in place, same as Home. This component never reads
  // `logStore` itself -- `DayRowCard` already reads its own `logEntry`
  // internally, so `'logged'`/`'orphaned-log'`/Missed rendering comes for
  // free with zero new merge logic.
  //
  // Also mirrors App.svelte's `#panel-home` three-way branch on
  // `planStore.status` (loading skeleton / retry-error / real day list) --
  // added after review pass 1 found that without it, a cold load or failed
  // fetch degraded `parsePlan(planStore.plan)` to `{ workouts: [] }` and
  // rendered an ordinary, clickable "today, rest day" row instead of Home's
  // own loading/error feedback (Review Triage Log, medium/bad_spec).
  //
  // Story 3.2 -- Rollups & Trend Chart. This is the first time this
  // component reads `logStore` at all (the note above, "this component never
  // reads logStore itself," was true through Story 3.1 only): `<TrendChart>`
  // and `<RollupSummary>` both need the raw `logStore.entries` record --
  // never a Data Store import of their own (this story's Always section) --
  // so this component does the one read and forwards it down as their
  // `entries` prop, the same "one owner reads the store, everyone else takes
  // a prop" shape `App.svelte` already uses for `logStore.entries` ->
  // `computeStreak`. Mounted above `.history-list`, in that fixed order
  // (chart, then summary, then day list) -- neither reads/derives anything
  // from `planStore`, so they're unaffected by the loading/error branches
  // above and only ever render in this `{:else}` (loaded) branch.
  //
  // Story 3.3 -- Week-End Review. Per this story's Decisions, a Sunday whose
  // week already has a saved Review routes that one row to the read-only
  // Review dialog instead of `WorkoutDetail` -- everywhere else, `DayRowCard`
  // is untouched (this story's Never section) and behaves exactly as before.
  // This component reads `weekEndReviewStore.reviews` itself (mirroring its
  // own `logStore.entries` read above) purely to decide, per row, which
  // callback to hand that one `DayRowCard` as its `onOpen` prop -- `App.svelte`
  // stays the sole owner of the resulting dialog state (`reviewDialog`), the
  // same "one owner reads the store, everyone else takes a prop" shape this
  // story's Boundaries already establish for `selectedDate`.
  import SkeletonDayRow from './SkeletonDayRow.svelte';
  import DayRowCard from './DayRowCard.svelte';
  import TrendChart from './TrendChart.svelte';
  import RollupSummary from './RollupSummary.svelte';
  import { planStore, loadPlan } from '../data/planStore.svelte';
  import { logStore } from '../data/logStore.svelte';
  import { weekEndReviewStore } from '../data/weekEndReviewStore.svelte';
  import { parsePlan } from '../domain/parsePlan';
  import { getPlanDayRange } from '../domain/getPlanDayRange';
  import { getTodayIso, parseLocalDate } from '../domain/date';

  // `onOpen` opens WorkoutDetail (forwarded straight through to every
  // `DayRowCard` mount, same as before Story 3.3); `onOpenReview` opens the
  // read-only Week-End Review dialog, forwarded instead of `onOpen` only for
  // a Sunday row whose week already has a saved Review (see
  // `isSavedReviewSunday` below and its use in the DayRowCard mount markup).
  // `App.svelte` stays the sole owner of both `selectedDate` and
  // `reviewDialog` (Boundaries: "no second selected-date variable").
  let {
    onOpen,
    onOpenReview,
  }: { onOpen: (date: string) => void; onOpenReview: (weekStartIso: string) => void } = $props();

  /** True only when `date` is that week's own Sunday (`getWeekStartIso`'s
   * own convention: a Sunday's week starts on itself, so `weekStartIso ===
   * date` for a Sunday) AND a Review has already been saved for it -- any
   * other date (including a Sunday with nothing saved yet, which only ever
   * happens for *today*, reachable only via the banner, never a History row
   * per this story's Decisions) keeps opening `WorkoutDetail` exactly as
   * before. */
  function isSavedReviewSunday(date: string): boolean {
    return parseLocalDate(date).getDay() === 0 && weekEndReviewStore.reviews[date] !== undefined;
  }

  // Computed once, not re-derived reactively -- mirrors App.svelte's/
  // DayRowCard's own `todayIso` (the Never section is explicit that "today"
  // never live-recomputes while the app stays open across a midnight
  // rollover), and this value has no reactive dependencies of its own to
  // ever trigger a re-run anyway.
  const todayIso = getTodayIso();

  // Same Plan-derived span `getPlanDayRange` already produces for Home
  // (Boundaries: "no second, differently-scoped notion of 'all days'"). Both
  // `$derived` so a background Plan refetch that silently updates
  // `planStore.plan` re-renders these rows in place with no re-mount, same
  // as Home's own pattern.
  const plan = $derived(parsePlan(planStore.plan));
  const dayRange = $derived(getPlanDayRange(plan.workouts, todayIso));
  // Built from `plan.workouts` in array order so a later duplicate entry for
  // the same date overwrites an earlier one in the map, mirroring
  // App.svelte's own "the later array entry wins for that date" rule.
  const workoutsByDate = $derived(new Map(plan.workouts.map((workout) => [workout.date, workout])));
</script>

<div class="history-view">
  {#if planStore.status === 'loading'}
    <!-- Mirrors App.svelte's own cold-load skeleton exactly: placeholders,
         never a spinner, plus a visually-hidden live region so a
         screen-reader user gets some indication anything is loading (the
         skeleton rows themselves are aria-hidden approximations). -->
    <div class="skeleton-list">
      <span class="visually-hidden" aria-live="polite">Loading your plan…</span>
      {#each Array.from({ length: 5 }) as _, i (i)}
        <SkeletonDayRow />
      {/each}
    </div>
  {:else if planStore.status === 'error'}
    <!-- Mirrors App.svelte's own retry-error UI exactly, including reusing
         the same `loadPlan` fetch path a Retry tap re-runs. -->
    <div class="plan-error" role="alert">
      <p>Couldn't load your plan — check your connection and try again</p>
      <button type="button" class="retry-button" onclick={loadPlan}>Retry</button>
    </div>
  {:else}
    <TrendChart entries={logStore.entries} />
    <RollupSummary entries={logStore.entries} />
    <!-- Independently scrollable from the rest of the page (AC1), distinct
         from Home's own `.day-list`, which scrolls as part of the whole
         document -- see this rule's `overflow-y`/`max-height` below. -->
    <div class="history-list">
      {#each dayRange as date (date)}
        <DayRowCard
          {date}
          workout={workoutsByDate.get(date)}
          isToday={date === todayIso}
          onOpen={isSavedReviewSunday(date) ? onOpenReview : onOpen}
        />
      {/each}
    </div>
  {/if}
</div>

<style>
  .skeleton-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .history-list {
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--border);
    /* AC1: scrolls independently of the rest of the page. Bounded by the
       viewport minus `main`'s own top padding (`--space-7`, the reserved
       clearance this list sits inside -- without subtracting it too, this
       region could extend slightly past where `main`'s own padding begins),
       the tab bar's own height, and the Android gesture-nav safe-area inset,
       mirroring App.svelte's `main` padding-bottom recipe -- every operand
       here is a design token or a UA-supplied environment value, never a
       hardcoded literal. */
    overflow-y: auto;
    max-height: calc(
      100dvh - var(--space-7) - var(--tab-bar-height) - env(safe-area-inset-bottom, 0px)
    );
  }

  .plan-error {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-6);
  }

  .plan-error p {
    font-family: var(--type-body-font-family);
    font-size: var(--type-body-size);
    font-weight: var(--type-body-weight);
    line-height: var(--type-body-line-height);
    color: var(--text-primary);
  }

  .retry-button {
    min-height: 3rem; /* epic's tap-target floor */
    padding: var(--space-4) var(--space-7);
    border: none;
    border-radius: var(--radius-sm);
    background: var(--accent-primary);
    color: var(--surface);
    font-family: var(--type-body-font-family);
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
    border: none;
  }
</style>
