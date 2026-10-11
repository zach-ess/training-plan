<script lang="ts">
  // Story 4.4 -- `week-header` (EXPERIENCE.md Component Patterns / DESIGN.md
  // Components): a non-interactive heading placed before the first day of
  // each plan week on Home and History, restoring the prior app's week
  // header card in this design's flat, hairline register -- no fill, no
  // tap target, never focusable. "Week N · Oct 12–18 · Return" on the first
  // line, the Plan's one-line focus beneath it.
  //
  // A native `<h2>` holds the title line only (review loop 1: real heading
  // semantics over `role="heading"` on a span), under
  // App.svelte's single visually-hidden `<h1>`, so a screen reader's heading
  // list reads "Week 1 · Oct 12–18 · Return" -- the focus line follows as
  // plain text rather than bloating every heading's name.
  import { parseLocalDate } from '../domain/date';
  import type { PlanWeek } from '../domain/parsePlan';

  let { week }: { week: PlanWeek } = $props();

  function monthShort(date: Date): string {
    return date.toLocaleDateString(undefined, { month: 'short' });
  }

  /** "Oct 12–18", "Oct 26–Nov 1", or "Dec 28–Jan 3" -- the month is repeated
   * only when the week crosses into a new one. No year: a plan spans months,
   * and the header only needs to orient within it. */
  function formatRange(startIso: string, endIso: string): string {
    const start = parseLocalDate(startIso);
    const end = parseLocalDate(endIso);
    const startText = `${monthShort(start)} ${start.getDate()}`;
    const sameMonth = start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth();
    const endText = sameMonth ? `${end.getDate()}` : `${monthShort(end)} ${end.getDate()}`;
    return `${startText}–${endText}`;
  }

  const title = $derived(
    [
      week.weekNumber !== undefined ? `Week ${week.weekNumber}` : undefined,
      formatRange(week.startDate, week.endDate),
      week.phase,
    ]
      .filter((part) => part !== undefined)
      .join(' · '),
  );
</script>

<div class="week-header">
  <h2 class="week-title">{title}</h2>
  {#if week.focus}
    <span class="week-focus">{week.focus}</span>
  {/if}
</div>

<style>
  .week-header {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-6) var(--gutter) var(--space-4);
    border-bottom: 1px solid var(--border);
  }

  .week-title {
    margin: 0;
    font-family: var(--type-meta-font-family);
    font-size: var(--type-meta-size);
    font-weight: 600;
    font-variant-numeric: var(--type-meta-font-variant-numeric);
    color: var(--text-primary);
    overflow-wrap: break-word;
  }

  .week-focus {
    font-family: var(--type-caption-font-family);
    font-size: var(--type-caption-size);
    font-weight: var(--type-caption-weight);
    color: var(--text-secondary);
    overflow-wrap: break-word;
  }
</style>
