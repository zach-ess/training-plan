<script lang="ts">
  // Story 1.5 -- one row per ISO date in Home's day list.
  //
  // `workout` is already resolved by the caller (App.svelte) to whichever
  // Workout matches this exact `date`, with the "later array entry wins"
  // duplicate rule (I/O matrix) already applied there -- this component only
  // ever sees at most one Workout per date.
  //
  // Built as a real `<button type="button">` now. Story 2.1 wires Workout
  // Detail drill-down onto this same element via the required `onOpen` prop,
  // rather than restructuring non-interactive markup later (Design Notes).
  //
  // Story 2.4 -- Home's day list becomes LogEntry-aware for the first time:
  // `logEntry` is now a real `$derived(getLogEntry(date))` read (mirroring
  // `WorkoutDetail`'s own precedent) instead of the hardcoded `undefined`
  // every prior story passed, so `getDayView`'s `'logged'`/`'orphaned-log'`
  // branches are now actually reachable here, and a past scheduled day with
  // no LogEntry can be told apart from an untouched rest day ("Missed").
  import { getDayView } from '../domain/getDayView';
  import { parseLocalDate, getTodayIso } from '../domain/date';
  import { getLogEntry } from '../data/logStore.svelte';
  import type { Workout } from '../domain/parsePlan';

  let {
    date,
    workout,
    isToday,
    onOpen,
  }: { date: string; workout: Workout | undefined; isToday: boolean; onOpen: (date: string) => void } =
    $props();

  // `$derived` off `logStore.entries` (via `getLogEntry`), the same
  // reactive object `setCompleted`/`replaceLogEntry` reassign on a
  // successful write -- so a save updates this row's Missed state live, in
  // the same render as Completion Feedback (AC5), with no explicit
  // event/callback wiring. Same reactive mechanism `WorkoutDetail`'s own
  // `dayView` already relies on.
  const logEntry = $derived(getLogEntry(date));
  const dayView = $derived(getDayView(workout, logEntry));

  const dateObj = $derived(parseLocalDate(date));
  const weekdayShort = $derived(
    dateObj.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase(),
  );

  // Computed once, not re-derived reactively -- mirrors App.svelte's own
  // `todayIso` (the Never section is explicit that "today" never
  // live-recomputes while the app stays open across a midnight rollover),
  // and this value has no reactive dependencies of its own to ever trigger
  // a re-run anyway.
  const todayIso = getTodayIso();

  const isRestDay = $derived(dayView.kind === 'empty');
  // Story 2.4 -- a past scheduled day that has fully elapsed (`date <
  // todayIso`, local time -- the same plain string comparison `computeStreak`
  // uses, not a divergent implementation) and was not genuinely completed:
  // either `'planned'` (no LogEntry at all) or `'logged'` with
  // `dayView.completed === false` (amended 2026-09-25, `intent_gap`: an
  // explicit Mark Incomplete on a scheduled day is exactly as "missed" as
  // never logging it at all). An `'orphaned-log'` day (nothing scheduled)
  // marked `completed: false` is excluded from the Streak (computeStreak.ts)
  // but never shown as Missed here -- not because of the `workout !==
  // undefined` check below (by `getDayView`'s own contract, `'planned'`/
  // `'logged'` are only reachable when `workout` is already truthy, so that
  // check is redundant against `dayView.kind` alone), but because
  // `'orphaned-log'` simply never matches either disjunct. `workout !==
  // undefined` is kept anyway as defense-in-depth/self-documentation
  // (comment corrected 2026-09-25 -- previously overstated this as the thing
  // doing the excluding). `!isToday` is checked here directly (not left to
  // fall out of `date < todayIso` alone) so today's own chip/label/tint
  // always takes precedence over Missed, even on the (impossible in normal
  // use, but defended anyway) chance a caller ever passes `isToday` for a
  // date that also satisfies the elapsed test -- a row never shows both
  // (Boundaries).
  const isMissed = $derived(
    !isToday &&
      date < todayIso &&
      workout !== undefined &&
      (dayView.kind === 'planned' || (dayView.kind === 'logged' && dayView.completed === false)),
  );
  // `||`, not `??` -- a Workout whose `type` is present but an empty string
  // (a plausible hand-edit artifact, e.g. a script that defaults an unset
  // field to `""` rather than omitting it) must still fall back to
  // "Workout" per the I/O matrix's "never blank" guarantee for this field;
  // `??` only catches `null`/`undefined`; and lets a genuinely empty string
  // straight through.
  const title = $derived(isRestDay ? 'Rest Day' : dayView.type || 'Workout');
  // Story 2.4 -- a Missed row's meta line reads exactly "missed — no log
  // entry" (DESIGN.md's literal copy), overriding the usual
  // duration/distance readout -- there's nothing logged to show.
  const meta = $derived(
    isMissed
      ? 'missed — no log entry'
      : isRestDay
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
  // `isMissed` has no separate "Missed" segment here (fixed 2026-09-25,
  // Blind Hunter finding, low/patch) -- unlike `isToday`, whose "Today"
  // never otherwise appears in `statusText`, a Missed row's `statusText`
  // already carries the state via the frozen `"missed — no log entry"` meta
  // text, so prepending "Missed" too announced it twice back to back
  // ("..., Missed, Run, missed — no log entry"). The Accessibility Floor's
  // never-color-only rule is still satisfied: "missed — no log entry" alone
  // conveys the state in the accessible name, matching the visible
  // `.missed-label` text.
  const ariaLabel = $derived(
    isToday ? `${accessibleDate}, Today, ${statusText}` : `${accessibleDate}, ${statusText}`,
  );
</script>

<button
  type="button"
  class="day-row"
  class:today={isToday}
  class:missed={isMissed}
  data-today={isToday ? 'true' : undefined}
  data-date={date}
  aria-label={ariaLabel}
  onclick={() => onOpen(date)}
>
  <span
    class="chip"
    class:chip-today={isToday}
    class:chip-missed={isMissed}
    class:chip-rest={!isToday && !isMissed && isRestDay}
    class:chip-upcoming={!isToday && !isMissed && !isRestDay}
    aria-hidden="true"
  ></span>
  <!-- `aria-hidden`: the button's own `aria-label` above is meant to be the
       only channel through which this row's weekday/date/status info
       reaches a screen reader (see that derivation's comment) -- but an
       `aria-label` replaces the button's announced *name*, it does not
       remove its visible children from the accessibility tree. Without
       this, a screen reader's browse-mode virtual cursor can still land on
       and read "TUE"/"Today"/"Missed"/the title/the meta line as separate
       content, redundant with (and inconsistently worded against) the
       aria-label already announced on the button itself. -->
  <span class="day-main" aria-hidden="true">
    <span class="day-heading">
      <span class="weekday">{weekdayShort}</span>
      {#if isToday}
        <span class="today-label">Today</span>
      {:else if isMissed}
        <!-- Story 2.4 -- mirrors the existing "today-label" pattern: the
             chip alone is never the only signal (Accessibility Floor), so
             this adjacent text label carries "Missed" for a sighted user
             even before the aria-label is ever read. -->
        <span class="missed-label">Missed</span>
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

  /* Story 2.4 -- same faint full-row tint recipe as `.day-row.today` above,
     just mixing `--accent-caution` instead of `--accent-primary` (this
     story's Always section). Mutually exclusive with `.today` in practice --
     `isMissed` is only ever true when `!isToday` -- so precedence between
     the two never has to be resolved here. */
  .day-row.missed {
    background: color-mix(in srgb, var(--accent-caution) 6%, var(--background));
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

  /* Story 2.4 -- `rounded.full`, matching "today"'s own shape (DESIGN.md's
     day-row-card token mapping: `chip-missed: {colors.accent-caution}`,
     paired with `chip-radius-current: {rounded.full}`). */
  .chip.chip-missed {
    background: var(--accent-caution);
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

  /* Story 2.4 -- mirrors `.today-label` above, colored to match the Missed
     chip/tint (`--accent-caution`) rather than `--accent-primary` -- pairs
     the state's color with its text label rather than introducing a
     color-only signal (DESIGN.md's "pair every workout-type or state color
     with its text label" principle). */
  .missed-label {
    font-family: var(--type-caption-font-family);
    font-size: var(--type-caption-size);
    font-weight: 600;
    color: var(--accent-caution);
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
