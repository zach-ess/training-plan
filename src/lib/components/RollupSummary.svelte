<script lang="ts">
  // Story 3.2 -- Rollups & Trend Chart. The per-type totals half of this
  // story (AC6) -- `TrendChart.svelte` is the single-color trend half.
  // Mounted by `HistoryView.svelte`, which does the one `logStore.entries`
  // read and forwards it down as `entries` (this story's Code Map) -- this
  // component itself never imports the Data Store, staying a pure view over
  // whatever `entries` it's given.
  //
  // Month-to-date and year-to-date are calendar-to-date windows (Decisions,
  // confirmed with Zach 2026-09-25) -- they reset on the 1st of the
  // month/year, never a rolling 30/365-day window -- computed fresh from
  // `getTodayIso()` and handed to `computeRollup` alongside `todayIso` itself
  // as the period's end, so a month/year boundary day (the 1st) only ever
  // includes that day's own entry (I/O matrix).
  //
  // Always renders per-type, never one blended figure (AC6/EXPERIENCE.md) --
  // including honest all-zero totals for a brand-new install with nothing
  // logged yet (AC3), the same "show zeros, don't hide them" precedent
  // `StreakIndicator` already established for the Streak count.
  import { computeRollup, type RollupType } from '../domain/computeRollup';
  import { getTodayIso, parseLocalDate, toLocalIsoDate } from '../domain/date';

  let { entries }: { entries: Record<string, unknown> } = $props();

  // Computed once, not re-derived reactively -- mirrors every other
  // `getTodayIso()` call site in this app: "today" never live-recomputes
  // while the app stays open across a midnight rollover.
  const todayIso = getTodayIso();

  const monthStartIso = $derived.by(() => {
    const today = parseLocalDate(todayIso);
    return toLocalIsoDate(new Date(today.getFullYear(), today.getMonth(), 1));
  });
  const yearStartIso = $derived.by(() => {
    const today = parseLocalDate(todayIso);
    return toLocalIsoDate(new Date(today.getFullYear(), 0, 1));
  });

  // Both `$derived` from `entries` (which is itself `logStore.entries`,
  // reassigned wholesale on every successful write) -- a new Log Entry saved
  // while History is open recomputes both totals with no manual refresh
  // (AC2).
  const monthToDate = $derived(computeRollup(entries, monthStartIso, todayIso));
  const yearToDate = $derived(computeRollup(entries, yearStartIso, todayIso));

  // Rendered in this fixed order regardless of which counts are zero --
  // never reordered by count, so the layout stays stable as Log Entries
  // accumulate.
  const TYPE_ORDER: RollupType[] = [
    'Run',
    'Bike',
    'Lift',
    'Mobility',
    'Stretch',
    'Other',
    'Unspecified',
  ];
</script>

<div class="rollup-summary">
  <section class="rollup-period" aria-label="Month to date">
    <p class="rollup-period-label">Month to date</p>
    <ul class="rollup-list">
      {#each TYPE_ORDER as type (type)}
        <li class="rollup-item">
          <span class="rollup-type-label">{type}</span>
          <span class="rollup-stat-value">{monthToDate[type]}</span>
        </li>
      {/each}
    </ul>
  </section>
  <section class="rollup-period" aria-label="Year to date">
    <p class="rollup-period-label">Year to date</p>
    <ul class="rollup-list">
      {#each TYPE_ORDER as type (type)}
        <li class="rollup-item">
          <span class="rollup-type-label">{type}</span>
          <span class="rollup-stat-value">{yearToDate[type]}</span>
        </li>
      {/each}
    </ul>
  </section>
</div>

<style>
  .rollup-summary {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    box-sizing: border-box;
    padding: var(--space-6);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    margin-bottom: var(--space-7);
  }

  .rollup-period-label {
    margin: 0 0 var(--space-4);
    font-family: var(--type-caption-font-family);
    font-size: var(--type-caption-size);
    font-weight: var(--type-caption-weight);
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .rollup-list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-6);
  }

  .rollup-item {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2);
    min-width: 3.5rem;
  }

  .rollup-type-label {
    font-family: var(--type-rollup-label-font-family);
    font-size: var(--type-rollup-label-size);
    font-weight: var(--type-rollup-label-weight);
    letter-spacing: var(--type-rollup-label-letter-spacing);
    color: var(--text-secondary);
    text-transform: uppercase;
  }

  .rollup-stat-value {
    font-family: var(--type-stat-value-font-family);
    font-size: var(--type-stat-value-size);
    font-weight: var(--type-stat-value-weight);
    font-variant-numeric: var(--type-stat-value-font-variant-numeric);
    color: var(--text-primary);
  }
</style>
