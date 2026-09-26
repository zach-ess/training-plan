<script lang="ts">
  // Story 3.3 -- Week-End Review: the full-screen dialog opened either
  // unsaved/editable from Home's Sunday-only banner, or read-only from a
  // saved week's Sunday row in History & Trends (this story's Decisions).
  // Mirrors `WorkoutDetail.svelte`'s own overlay pattern exactly (this
  // story's Boundaries): a scrim + panel `role="dialog"`/`aria-modal="true"`,
  // a real `<button type="button" class="back-button">` Back control, and
  // the same focus-on-mount + Tab-cycle focus-trap `$effect` -- App.svelte
  // (the one caller) is responsible for `inert`/`aria-hidden` on both tab
  // panels while this is mounted, the same way it already does for
  // `WorkoutDetail`.
  //
  // `readOnly` is the one thing that changes this dialog's whole shape: when
  // `true`, every number and the reflection text come verbatim from the
  // frozen `WeekEndReview` this story's Data Store already saved for
  // `weekStartIso` -- never recomputed, even if that week's Log Entries are
  // later edited (this story's I/O matrix, "Reopen a saved week"). When
  // `false` (only ever reachable via the banner, for the current week), every
  // number is `$derived` live off `logStore.entries`/`planStore.plan`, the
  // same "recomputes with no manual refresh" precedent `RollupSummary`/
  // `TrendChart` already established in Story 3.2, and a reflection
  // `<textarea>` is editable and Save writes the numbers + reflection
  // together in one `saveReview` call (this story's Always section).
  import { planStore } from '../data/planStore.svelte';
  import { logStore } from '../data/logStore.svelte';
  import { getReview, saveReview, type WriteResult } from '../data/weekEndReviewStore.svelte';
  import { parsePlan } from '../domain/parsePlan';
  import { getPlanDayRange } from '../domain/getPlanDayRange';
  import { computeStreak } from '../domain/computeStreak';
  import { computeRollup, ROLLUP_TYPE_ORDER } from '../domain/computeRollup';
  import { computeMissedCount } from '../domain/computeMissedCount';
  import { getTodayIso, getWeekDates, parseLocalDate, toLocalIsoDate } from '../domain/date';

  let {
    weekStartIso,
    readOnly,
    onClose,
  }: { weekStartIso: string; readOnly: boolean; onClose: () => void } = $props();

  // Rendered in this fixed order regardless of which counts are zero.
  //
  // Epic 3 retro fix (F6, 2026-09-26): this used to be its own local
  // `TYPE_ORDER` array, whose own comment admitted it was hand-duplicated
  // from `RollupSummary.svelte`'s own copy rather than sharing it -- now the
  // one shared `ROLLUP_TYPE_ORDER` export from `computeRollup.ts`.

  // Computed once, not re-derived reactively -- mirrors every other
  // `getTodayIso()` call site in this app.
  const todayIso = getTodayIso();

  // Independently re-derives `plan`/`dayRange`/`workoutsByDate` off
  // `planStore.plan` the same way App.svelte and HistoryView.svelte each
  // already do (this story's Code Map: "needs planStore.plan/logStore.entries
  // the same way those components already read them") -- no new shared
  // derivation is introduced, and none of Story 2.4/3.2's own domain
  // functions are touched.
  const plan = $derived(parsePlan(planStore.plan));
  const dayRange = $derived(getPlanDayRange(plan.workouts, todayIso));
  const workoutsByDate = $derived(new Map(plan.workouts.map((workout) => [workout.date, workout])));

  // Epic 3 retro fix (F1, 2026-09-26): despite its name, `weekStartIso` is
  // the Sunday this review is filed under -- App.svelte's banner and
  // HistoryView's saved-Sunday lookup both depend on that value staying the
  // Sunday's own date, so it isn't renamed here. But Zach's own convention
  // is Sunday as the LAST day of his workout week (Monday-Sunday), not the
  // first -- confirmed directly with him during this retro, after the
  // original implementation (and this file's own earlier review passes)
  // assumed the opposite, matching `computeTrend`'s Sun-Sat bucketing
  // convention. That mismatch meant the live rollup-grid computed a window
  // starting *today* and running into the future -- `computeMissedCount`
  // could only ever return 0 (every date in range is `>= todayIso`), and
  // `computeRollup` only ever saw whatever was logged on the Sunday itself.
  // The window is now built backward: the 7 days ending on and including
  // `weekStartIso`, via the same parseLocalDate/toLocalIsoDate arithmetic
  // every other date computation in this app uses (never `new
  // Date(iso)`/`toISOString()`, per AD-2) -- `getWeekDates` itself is
  // unchanged (it still just returns 7 consecutive dates starting from
  // whatever ISO date it's given); only which date this file feeds it as
  // that start changed. Scope confirmed with Zach: this fix is scoped to
  // Week-End Review alone -- `computeTrend`'s own Sun-Sat bucketing for the
  // already-shipped Trend Chart (Story 3.2) is deliberately left untouched.
  const windowStartIso = $derived.by(() => {
    const weekEnd = parseLocalDate(weekStartIso);
    return toLocalIsoDate(new Date(weekEnd.getFullYear(), weekEnd.getMonth(), weekEnd.getDate() - 6));
  });
  const weekDates = $derived(getWeekDates(windowStartIso));
  const weekEndIso = $derived(weekStartIso);

  const weekRangeLabel = $derived.by(() => {
    const fmt = (iso: string) =>
      parseLocalDate(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `${fmt(windowStartIso)} – ${fmt(weekEndIso)}`;
  });

  // Live rollup-grid values (Always section: "computes fresh at open time...
  // live until Save freezes it"). Always computed, even in read-only mode --
  // cheap, pure, and it keeps this file from needing two separate code paths
  // for "what Save would write" vs. "what's shown."
  const liveByType = $derived(computeRollup(logStore.entries, windowStartIso, weekEndIso));
  const liveWorkoutsCompleted = $derived(
    (Object.values(liveByType) as number[]).reduce((sum, count) => sum + count, 0),
  );
  // Full Plan day range, same call Home's own Streak uses (this story's
  // Always section) -- never a week-scoped range.
  const liveStreak = $derived(computeStreak(dayRange, workoutsByDate, logStore.entries, todayIso));
  const liveMissedCount = $derived(
    computeMissedCount(weekDates, workoutsByDate, logStore.entries, todayIso),
  );

  // Read-only mode's frozen snapshot -- the one and only place this file
  // reads a previously-saved WeekEndReview. `undefined` only in the
  // defensive case of a `readOnly` open for a week with no saved Review at
  // all (never reachable through this app's own UI, which only ever opens
  // read-only via a History row already gated on a saved Review existing) --
  // falls back to the live values rather than rendering nothing.
  const savedReview = $derived(readOnly ? getReview(weekStartIso) : undefined);

  const workoutsCompleted = $derived(savedReview ? savedReview.workoutsCompleted : liveWorkoutsCompleted);
  const byType = $derived(savedReview ? savedReview.byType : liveByType);
  const streak = $derived(savedReview ? savedReview.streak : liveStreak);
  const missedCount = $derived(savedReview ? savedReview.missedCount : liveMissedCount);

  // Reflection: a plain local draft while editable (nothing is persisted
  // until Save), or the frozen saved text in read-only mode -- never a
  // two-way binding onto the saved record either way (this story's Never
  // section: "no editing a saved Review's reflection... after Save").
  let reflectionDraft = $state('');
  const reflectionDisplay = $derived(readOnly ? (savedReview?.reflection ?? '') : reflectionDraft);

  let writeErrorReason = $state<'quota-exceeded' | 'write-error' | undefined>(undefined);

  function handleSave() {
    writeErrorReason = undefined;
    const result: WriteResult = saveReview({
      weekStartIso,
      workoutsCompleted: liveWorkoutsCompleted,
      byType: liveByType,
      streak: liveStreak,
      missedCount: liveMissedCount,
      reflection: reflectionDraft,
    });
    if (!result.ok) {
      writeErrorReason = result.reason;
      return;
    }
    // Only success closes the dialog and drops the banner (Always section) --
    // the banner's own visibility is a separate `$derived` in App.svelte over
    // this same Data Store, so it disappears the instant this write commits,
    // with no explicit event needed here beyond closing.
    onClose();
  }

  let backButtonEl = $state<HTMLButtonElement | undefined>();
  let panelEl = $state<HTMLDivElement | undefined>();

  // Mirrors WorkoutDetail.svelte's own mount effect exactly: focuses Back on
  // mount, owns Escape-to-close, and traps Tab/Shift+Tab inside whichever
  // controls are actually focusable right now (a live query over `panelEl`,
  // not a hardcoded ref list -- editable mode has a Save button and,
  // sometimes, a Retry button; read-only mode has only Back).
  $effect(() => {
    backButtonEl?.focus({ preventScroll: true });

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        const focusableSelector =
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])';
        const focusables = panelEl
          ? Array.from(panelEl.querySelectorAll<HTMLElement>(focusableSelector))
          : [];
        if (focusables.length === 0) {
          return;
        }
        const activeIndex = focusables.indexOf(document.activeElement as HTMLElement);
        const step = event.shiftKey ? -1 : 1;
        const nextIndex =
          activeIndex === -1
            ? event.shiftKey
              ? focusables.length - 1
              : 0
            : (activeIndex + step + focusables.length) % focusables.length;
        focusables[nextIndex]?.focus();
      }
    }

    window.addEventListener('keydown', handleKeydown);
    return () => {
      window.removeEventListener('keydown', handleKeydown);
    };
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="scrim" onclick={onClose}>
  <div
    class="panel"
    role="dialog"
    aria-modal="true"
    aria-labelledby="week-end-review-title"
    tabindex="-1"
    bind:this={panelEl}
    onclick={(event) => event.stopPropagation()}
  >
    <button type="button" class="back-button" bind:this={backButtonEl} onclick={onClose}>
      ← Back
    </button>
    <h2 id="week-end-review-title" class="title">Week-End Review</h2>
    <p class="week-range">{weekRangeLabel}</p>

    <div class="rollup-grid">
      <div class="rollup-cell">
        <span class="rollup-cell-label">Workouts completed</span>
        <span class="rollup-cell-value">{workoutsCompleted}</span>
      </div>
      <div class="rollup-cell">
        <span class="rollup-cell-label">Streak</span>
        <span class="rollup-cell-value">{streak}</span>
      </div>
      <div class="rollup-cell">
        <span class="rollup-cell-label">Days missed</span>
        <span class="rollup-cell-value">{missedCount}</span>
      </div>
      <div class="rollup-cell rollup-cell-bytype">
        <span class="rollup-cell-label">By type</span>
        <ul class="rollup-bytype-list">
          {#each ROLLUP_TYPE_ORDER as type (type)}
            <li class="rollup-bytype-item">
              <span class="rollup-type-label">{type}</span>
              <span class="rollup-cell-value">{byType[type]}</span>
            </li>
          {/each}
        </ul>
      </div>
    </div>

    <div class="reflection-field">
      <!-- `for`/`id` only pairs a real `<label>` with the editable
           `<textarea>` -- a `<p>` isn't a labelable form control, so the
           read-only branch instead uses a plain `<span>` caption with a
           matching `id`, referenced via `aria-labelledby` (never `for`,
           which the HTML spec reserves for actual form controls). -->
      {#if readOnly}
        <span id="week-end-review-reflection-label" class="field-label">Reflection</span>
        <p aria-labelledby="week-end-review-reflection-label" class="reflection-readout">
          {reflectionDisplay || 'No reflection written.'}
        </p>
      {:else}
        <label class="field-label" for="week-end-review-reflection">Reflection</label>
        <textarea
          id="week-end-review-reflection"
          class="reflection-input"
          placeholder="How did this week go?"
          bind:value={reflectionDraft}
        ></textarea>
      {/if}
    </div>

    {#if !readOnly}
      <div class="actions">
        <button type="button" class="save-button" onclick={handleSave}>Save</button>
        {#if writeErrorReason}
          <p class="write-error" role="alert">
            {writeErrorReason === 'quota-exceeded'
              ? "Couldn't save — your device storage is full. Free up space and try again."
              : "Couldn't save — something went wrong. Try again."}
            <button type="button" class="retry-button" onclick={handleSave}>Retry</button>
          </p>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  /* Mirrors WorkoutDetail.svelte's `.scrim`/`.panel` rules verbatim -- same
     tab-bar clearance, same z-index precedent, same bottom-sheet shape. */
  .scrim {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: calc(var(--tab-bar-height) + env(safe-area-inset-bottom, 0px));
    z-index: 20;
    display: flex;
    align-items: flex-end;
    background: color-mix(in srgb, var(--text-primary) 40%, transparent);
  }

  .panel {
    width: 100%;
    max-height: 85%;
    overflow-y: auto;
    box-sizing: border-box;
    padding: var(--space-7) var(--gutter);
    background: var(--surface);
    border-top: 1px solid var(--border);
    border-top-left-radius: var(--radius-sm);
    border-top-right-radius: var(--radius-sm);
  }

  .back-button {
    all: unset;
    box-sizing: border-box;
    display: inline-block;
    min-height: 3rem; /* 48dp-equivalent minimum tap target */
    padding: var(--space-4) var(--space-5) var(--space-4) 0;
    cursor: pointer;
    font-family: var(--type-meta-font-family);
    font-size: var(--type-meta-size);
    font-weight: var(--type-meta-weight);
    color: var(--text-secondary);
  }

  .back-button:focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: 2px;
  }

  .title {
    margin: 0 0 var(--space-3);
    font-family: var(--type-title-font-family);
    font-size: var(--type-title-size);
    font-weight: var(--type-title-weight);
    color: var(--text-primary);
  }

  .week-range {
    margin: 0 0 var(--space-7);
    font-family: var(--type-meta-font-family);
    font-size: var(--type-meta-size);
    font-weight: var(--type-meta-weight);
    color: var(--text-secondary);
    font-variant-numeric: var(--type-meta-font-variant-numeric);
  }

  /* This story's Always section: "rollup-grid uses --type-rollup-readout-*,
     the app's only use of it" -- ad hoc CSS, no dedicated grid token exists
     yet (this story's Code Map), mirroring WorkoutDetail.svelte's own
     `.stats` grid. */
  .rollup-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(7.5rem, 1fr));
    gap: var(--space-6);
    margin-bottom: var(--space-7);
  }

  .rollup-cell {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .rollup-cell-bytype {
    grid-column: 1 / -1;
  }

  .rollup-cell-label {
    font-family: var(--type-rollup-label-font-family);
    font-size: var(--type-rollup-label-size);
    font-weight: var(--type-rollup-label-weight);
    letter-spacing: var(--type-rollup-label-letter-spacing);
    color: var(--text-secondary);
    text-transform: uppercase;
  }

  .rollup-cell-value {
    font-family: var(--type-rollup-readout-font-family);
    font-size: var(--type-rollup-readout-size);
    font-weight: var(--type-rollup-readout-weight);
    font-variant-numeric: var(--type-rollup-readout-font-variant-numeric);
    color: var(--text-primary);
  }

  .rollup-bytype-list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-6);
  }

  .rollup-bytype-item {
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

  .reflection-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin-bottom: var(--space-7);
  }

  .field-label {
    font-family: var(--type-caption-font-family);
    font-size: var(--type-caption-size);
    font-weight: var(--type-caption-weight);
    color: var(--text-secondary);
  }

  /* This story's Code Map: "reflection textarea needs its own tall sizing --
     WorkoutEditForm.svelte's .field-input isn't tall enough" -- a dedicated
     class, not a reuse of `.field-input`, with a taller floor. */
  .reflection-input {
    box-sizing: border-box;
    width: 100%;
    min-height: 8rem;
    resize: vertical;
    padding: var(--space-4) var(--space-5);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text-primary);
    font-family: var(--type-body-font-family);
    font-size: var(--type-body-size);
    font-weight: var(--type-body-weight);
    line-height: var(--type-body-line-height);
  }

  .reflection-input:focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: 2px;
  }

  .reflection-readout {
    margin: 0;
    white-space: pre-wrap;
    font-family: var(--type-body-font-family);
    font-size: var(--type-body-size);
    font-weight: var(--type-body-weight);
    line-height: var(--type-body-line-height);
    color: var(--text-primary);
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .save-button {
    all: unset;
    box-sizing: border-box;
    min-height: 3rem; /* 48dp-equivalent minimum tap target */
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-5) var(--space-7);
    border: 1px solid var(--accent-primary);
    border-radius: var(--radius-sm);
    cursor: pointer;
    text-align: center;
    background: var(--accent-primary);
    color: var(--surface);
    font-family: var(--type-row-label-font-family);
    font-size: var(--type-row-label-size);
    font-weight: var(--type-row-label-weight);
  }

  .save-button:focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: 2px;
  }

  .write-error {
    margin: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-4);
    font-family: var(--type-body-font-family);
    font-size: var(--type-body-size);
    font-weight: var(--type-body-weight);
    line-height: var(--type-body-line-height);
    color: var(--accent-caution);
  }

  .retry-button {
    all: unset;
    box-sizing: border-box;
    min-height: 3rem; /* 48dp-equivalent minimum tap target */
    padding: var(--space-4) var(--space-6);
    border: 1px solid var(--accent-caution);
    border-radius: var(--radius-sm);
    cursor: pointer;
    background: transparent;
    color: var(--accent-caution);
    font-family: var(--type-body-font-family);
    font-size: var(--type-body-size);
    font-weight: var(--type-body-weight);
  }

  .retry-button:focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: 2px;
  }
</style>
