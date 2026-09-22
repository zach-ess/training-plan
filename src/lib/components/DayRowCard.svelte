<script lang="ts">
  // Story 1.5 -- one row per ISO date in Home's day list.
  //
  // `workout` is already resolved by the caller (App.svelte) to whichever
  // Workout matches this exact `date`, with the "later array entry wins"
  // duplicate rule (I/O matrix) already applied there -- this component only
  // ever sees at most one Workout per date. `logEntry` is always `undefined`
  // for every call site this story adds (no Data Store LogEntry read exists
  // until Epic 2) -- getDayView's `'logged'`/`'orphaned-log'` branches are
  // never reached here, only exercised for AD-8's contract completeness.
  //
  // Built as a real `<button type="button">` now. Story 2.1 wires Workout
  // Detail drill-down onto this same element via the required `onOpen` prop,
  // rather than restructuring non-interactive markup later (Design Notes).
  import { getDayView } from '../domain/getDayView';
  import { parseLocalDate } from '../domain/date';
  import type { Workout } from '../domain/parsePlan';

  let {
    date,
    workout,
    isToday,
    onOpen,
  }: { date: string; workout: Workout | undefined; isToday: boolean; onOpen: (date: string) => void } =
    $props();

  const dayView = $derived(getDayView(workout, undefined));

  const dateObj = $derived(parseLocalDate(date));
  const weekdayShort = $derived(
    dateObj.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase(),
  );

  // Every call site this story adds passes `logEntry: undefined`, so
  // `dayView.kind` is always `'planned'` (a Workout exists for this date) or
  // `'empty'` (no Workout -- render as a rest day, per the Boundaries
  // section: a date with no matching Workout always shows "Rest Day", never
  // blank).
  const isRestDay = $derived(dayView.kind === 'empty');
  // `||`, not `??` -- a Workout whose `type` is present but an empty string
  // (a plausible hand-edit artifact, e.g. a script that defaults an unset
  // field to `""` rather than omitting it) must still fall back to
  // "Workout" per the I/O matrix's "never blank" guarantee for this field;
  // `??` only catches `null`/`undefined`; and lets a genuinely empty string
  // straight through.
  const title = $derived(isRestDay ? 'Rest Day' : dayView.type || 'Workout');
  const meta = $derived(
    isRestDay
      ? undefined
      : [dayView.duration, dayView.distance].filter((v): v is string => Boolean(v)).join(' · ') ||
          undefined,
  );

  // Accessible name summarizing weekday, date, and status (EXPERIENCE.md's
  // build-time semantic requirement) -- the chip itself is `aria-hidden`
  // below, so this label is the only place any of that information reaches
  // a screen reader.
  const accessibleDate = $derived(
    dateObj.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
  );
  const statusText = $derived(meta ? `${title}, ${meta}` : title);
  const ariaLabel = $derived(
    isToday ? `${accessibleDate}, Today, ${statusText}` : `${accessibleDate}, ${statusText}`,
  );
</script>

<button
  type="button"
  class="day-row"
  class:today={isToday}
  data-today={isToday ? 'true' : undefined}
  data-date={date}
  aria-label={ariaLabel}
  onclick={() => onOpen(date)}
>
  <span
    class="chip"
    class:chip-today={isToday}
    class:chip-rest={!isToday && isRestDay}
    class:chip-upcoming={!isToday && !isRestDay}
    aria-hidden="true"
  ></span>
  <!-- `aria-hidden`: the button's own `aria-label` above is meant to be the
       only channel through which this row's weekday/date/status info
       reaches a screen reader (see that derivation's comment) -- but an
       `aria-label` replaces the button's announced *name*, it does not
       remove its visible children from the accessibility tree. Without
       this, a screen reader's browse-mode virtual cursor can still land on
       and read "TUE"/"Today"/the title/the meta line as separate content,
       redundant with (and inconsistently worded against) the aria-label
       already announced on the button itself. -->
  <span class="day-main" aria-hidden="true">
    <span class="day-heading">
      <span class="weekday">{weekdayShort}</span>
      {#if isToday}
        <span class="today-label">Today</span>
      {/if}
    </span>
    <span class="title">{title}</span>
    {#if meta}
      <span class="meta">{meta}</span>
    {/if}
  </span>
</button>

<style>
  .day-row {
    all: unset;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: var(--space-5);
    width: 100%;
    min-height: 3rem; /* 48dp-equivalent minimum, regardless of content */
    padding: var(--row-padding) var(--gutter);
    border-bottom: 1px solid var(--border);
    cursor: pointer;
  }

  /* `all: unset` above strips the browser's native focus outline along with
     everything else it resets -- this is the app's first real interactive
     `<button>` (TabBar's tab buttons and the Retry button both keep their
     native styling, so neither needed this). Without restoring a visible
     focus state, a keyboard user tabbing through the day list would land on
     each row with no indication of where focus is, defeating the whole
     point of building this as a real, focusable button per EXPERIENCE.md's
     accessibility floor. `:focus-visible` (not `:focus`) so a mouse/touch
     tap doesn't also draw the ring, matching platform-default button
     behavior. */
  .day-row:focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: -2px;
  }

  .day-row.today {
    background: color-mix(in srgb, var(--accent-primary) 6%, var(--background));
    border-radius: var(--radius-sm);
  }

  .chip {
    flex-shrink: 0;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: var(--radius-xs);
    background: var(--accent-rest);
  }

  .chip.chip-rest {
    background: var(--accent-rest);
  }

  .chip.chip-today {
    background: var(--accent-primary);
    border-radius: var(--radius-full);
  }

  .chip.chip-upcoming {
    background: transparent;
    border: 1px solid var(--border);
  }

  .day-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .day-heading {
    display: flex;
    align-items: baseline;
    gap: var(--space-4);
  }

  .weekday {
    font-family: var(--type-meta-font-family);
    font-size: var(--type-meta-size);
    font-weight: 600;
    color: var(--text-secondary);
    font-variant-numeric: var(--type-meta-font-variant-numeric);
  }

  .today-label {
    font-family: var(--type-caption-font-family);
    font-size: var(--type-caption-size);
    font-weight: 600;
    color: var(--accent-primary);
  }

  .title {
    font-family: var(--type-row-label-font-family);
    font-size: var(--type-row-label-size);
    font-weight: var(--type-row-label-weight);
    color: var(--text-primary);
  }

  .meta {
    font-family: var(--type-meta-font-family);
    font-size: var(--type-meta-size);
    font-weight: var(--type-meta-weight);
    color: var(--text-secondary);
    font-variant-numeric: var(--type-meta-font-variant-numeric);
  }
</style>
