<script lang="ts">
  // Story 3.2 -- Rollups & Trend Chart. The single-color bar chart half of
  // this story (AC5) -- `RollupSummary.svelte` is the per-type half. Mounted
  // by `HistoryView.svelte`, which does the one `logStore.entries` read and
  // forwards it down as `entries` (this story's Code Map: "HistoryView.svelte
  // reads logStore.entries for the first time... forwarding to both") --
  // this component itself never imports the Data Store, staying a pure view
  // over whatever `entries` it's given, the same as `DayRowCard`'s own
  // `workout`/`onOpen` props.
  //
  // Zero Log Entries anywhere -> the exact "insufficient data" copy (AC3),
  // never a chart with all-zero bars. Fewer than 12 weeks elapsed since the
  // first-ever Log Entry -> only that many bars render, including any
  // zero-count week within that elapsed span (this app's "show gaps, don't
  // hide them" precedent from Story 2.4's Missed-day treatment) -- but never
  // a bar for a week before the first entry ever existed (AC4).
  //   `computeTrend` itself always returns the full fixed 12-week window
  // (its own header comment); trimming to "only the elapsed weeks" is this
  // component's job, not `computeTrend`'s (this story's Tasks).
  import { computeTrend } from '../domain/computeTrend';
  import { getTodayIso, getWeekStartIso } from '../domain/date';
  import { isRecord } from '../domain/guards';

  let { entries }: { entries: Record<string, unknown> } = $props();

  // Computed once, not re-derived reactively -- mirrors every other
  // `getTodayIso()` call site in this app (App.svelte, HistoryView.svelte):
  // "today" never live-recomputes while the app stays open across a
  // midnight rollover, and this value has no reactive dependencies of its
  // own to ever trigger a re-run anyway.
  const todayIso = getTodayIso();
  const currentWeekStartIso = getWeekStartIso(todayIso);

  // Only the dates whose stored value is a real object AND explicitly
  // `completed: true` -- mirrors `computeTrend`/`computeRollup`'s own
  // tolerant-read convention *and* their `completed !== true` skip, so a
  // malformed stored value, or a LogEntry marked Mark Incomplete (a real,
  // reachable flow: mark complete, then mark incomplete again), can't count
  // as "having entries" or get picked as the earliest date below -- both of
  // which `computeTrend` itself already excludes from every week's count.
  // Without this, a user whose only LogEntries are all `completed: false`
  // would see `hasAnyEntries` as true and get an all-zero/flat chart instead
  // of the correct zero-state copy.
  const validEntryDates = $derived(
    Object.entries(entries)
      .filter(([, rawEntry]) => isRecord(rawEntry) && rawEntry.completed === true)
      .map(([date]) => date),
  );

  const hasAnyEntries = $derived(validEntryDates.length > 0);

  // The full fixed 12-week window (always 12 entries, oldest first) --
  // recomputed live whenever `entries` changes (AC2), since `entries` is
  // itself `logStore.entries`, reassigned wholesale on every successful
  // write.
  const trend = $derived(computeTrend(entries, todayIso));

  // The earliest LogEntry date across *all* of `entries`, not just those
  // inside the trend window -- a Log Entry from before the 12-week window
  // still proves the window is fully elapsed, so no trimming happens at all
  // in that case (AC5's "full trend window" row).
  const firstEntryWeekStartIso = $derived.by(() => {
    if (validEntryDates.length === 0) {
      return undefined;
    }
    const earliestDate = validEntryDates.reduce((earliest, date) =>
      date < earliest ? date : earliest,
    );
    return getWeekStartIso(earliestDate);
  });

  // Trims any week strictly before the first-ever Log Entry's own week
  // (AC4) -- when `firstEntryWeekStartIso` predates the whole window (the
  // full trend-window case), every week in `trend` already satisfies the
  // lower bound, so nothing is trimmed there.
  //
  // Epic 3 retro fix (F2, 2026-09-26): a stray future-dated Log Entry
  // (nothing currently prevents marking a future-scheduled workout complete)
  // can push `firstEntryWeekStartIso` *past* `currentWeekStartIso` -- `trend`
  // itself never contains a week beyond `currentWeekStartIso`, so clamping
  // only the filter's *upper* bound (the original fix) can never help: every
  // week still fails the *lower*-bound test against an out-of-range
  // `firstEntryWeekStartIso`, leaving `visibleWeeks` empty while
  // `hasAnyEntries` stays true -- the exact "unexplained blank chart" this
  // clamp exists to prevent, confirmed still reproducible by directly
  // executing this logic before this fix. Clamping `firstEntryWeekStartIso`
  // itself (never letting it exceed `currentWeekStartIso`) is what actually
  // closes it: once clamped, every week in `trend` again satisfies the lower
  // bound whenever `hasAnyEntries` is true, so real bars render instead of an
  // empty box.
  const effectiveFirstWeekStartIso = $derived(
    firstEntryWeekStartIso === undefined
      ? undefined
      : firstEntryWeekStartIso > currentWeekStartIso
        ? currentWeekStartIso
        : firstEntryWeekStartIso,
  );
  const visibleWeeks = $derived(
    effectiveFirstWeekStartIso === undefined
      ? []
      : trend.filter((week) => week.weekStartIso >= effectiveFirstWeekStartIso),
  );

  const maxCount = $derived(Math.max(1, ...visibleWeeks.map((week) => week.count)));

  /** Short local-date label for a week's starting Sunday (e.g. "Sep 21") --
   * an axis label, not a stored/compared value, so `toLocaleDateString` is
   * fine here even though the rest of this app avoids it for date math. */
  function weekLabel(weekStartIso: string): string {
    const [year, month, day] = weekStartIso.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  }
</script>

<div class="trend-chart">
  {#if !hasAnyEntries}
    <p class="trend-empty">Your trends will show up here once you've logged a few workouts</p>
  {:else}
    <div
      class="trend-bars"
      role="img"
      aria-label="Workouts per week, {visibleWeeks.length} week{visibleWeeks.length === 1
        ? ''
        : 's'} shown"
    >
      {#each visibleWeeks as week (week.weekStartIso)}
        <div class="trend-bar-column">
          <div class="trend-bar-track">
            <div class="trend-bar" style="height: {(week.count / maxCount) * 100}%"></div>
          </div>
          <span class="trend-bar-label">{weekLabel(week.weekStartIso)}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .trend-chart {
    box-sizing: border-box;
    padding: var(--space-6);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    margin-bottom: var(--space-7);
  }

  .trend-empty {
    margin: 0;
    font-family: var(--type-body-font-family);
    font-size: var(--type-body-size);
    font-weight: var(--type-body-weight);
    line-height: var(--type-body-line-height);
    color: var(--text-secondary);
  }

  .trend-bars {
    display: flex;
    align-items: flex-end;
    gap: var(--space-3);
    height: 6rem;
  }

  .trend-bar-column {
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    height: 100%;
    min-width: 0;
  }

  .trend-bar-track {
    display: flex;
    align-items: flex-end;
    width: 100%;
    height: 100%;
  }

  .trend-bar {
    width: 100%;
    min-height: 2px;
    background: var(--accent-primary);
    border-radius: var(--radius-sm);
  }

  .trend-bar-label {
    font-family: var(--type-caption-font-family);
    font-size: var(--type-caption-size);
    font-weight: var(--type-caption-weight);
    color: var(--text-secondary);
    white-space: nowrap;
  }
</style>
