<script lang="ts">
  // Story 2.1 -- WorkoutDetail: the read-only drill-down opened by tapping a
  // day row (Home's tap-to-drill-down primitive, "the single UX pattern
  // [Zach] most wants preserved" -- EXPERIENCE.md). Built as an overlay, not
  // a route/view swap, so App.svelte's day list stays mounted underneath and
  // `dayRange`/`activeTab`/scroll position are never touched by opening or
  // closing this component (this story's Boundaries).
  //
  // Read-only per this story's scope: no Mark Complete/Edit UI anywhere
  // here, and `getDayView` is always called with `logEntry: undefined` --
  // the same convention `DayRowCard` already uses, since no Data Store
  // LogEntry read exists until later Epic 2 stories (AD-8).
  //
  // `workout` is a reactive prop (App.svelte derives it from
  // `workoutsByDate.get(selectedDate)`), so a background Plan refetch that
  // changes or removes this date's Workout while the dialog is open updates
  // `dayView` in place via `$derived` -- the same reactive pattern Home's own
  // day list already relies on (I/O matrix).
  import { getDayView } from '../domain/getDayView';
  import type { Workout } from '../domain/parsePlan';
  import WorkoutDetailStat from './WorkoutDetailStat.svelte';

  let { date, workout, onClose }: { date: string; workout: Workout | undefined; onClose: () => void } =
    $props();
  // `date` is part of this component's frozen prop contract (Code Map) but
  // isn't read reactively in the component body -- the removed
  // `data-workout-detail-date` attribute was its only prior use, and
  // nothing reads it now. Kept as a prop (App.svelte still passes it)
  // without reintroducing that dead markup. The `svelte-ignore` below is
  // load-bearing, not decorative: a fresh-session review incorrectly
  // assumed it suppressed nothing, but `void date;` at this top-level
  // script scope genuinely triggers Svelte's `state_referenced_locally`
  // warning (reactive `$props()` values, like `$state`, only capture their
  // initial value when referenced outside a closure/reactive context) --
  // confirmed by removing this line and observing `svelte-check` report
  // exactly that warning at this location. This one-time initial-value read
  // is intentional (the prop is never meant to be read reactively here), so
  // the ignore is the correct call, not a workaround for the wrong rule.
  // svelte-ignore state_referenced_locally
  void date;

  const dayView = $derived(getDayView(workout, undefined));
  const isRestDay = $derived(dayView.kind === 'empty');
  // `||`, not `??` -- mirrors DayRowCard's own "never blank" rule: a Workout
  // whose `type` is present but an empty string must still fall back to
  // "Workout" rather than rendering blank.
  const title = $derived(isRestDay ? 'Rest Day' : dayView.type || 'Workout');

  let backButtonEl = $state<HTMLButtonElement | undefined>();

  // Mirrors Root.svelte's `$effect` + `addEventListener` + cleanup pattern
  // (this app's only prior example of an imperative mount/cleanup effect):
  // moves focus into the dialog once, on mount, and owns Escape-to-close for
  // as long as this component stays mounted. Nothing reactive is read in
  // this effect's body, so it runs exactly once per mount, not on every
  // update -- App.svelte keys each open on `selectedDate` by mounting a
  // fresh WorkoutDetail per date rather than swapping props on a
  // long-lived one, so "once per mount" is the same thing as "once per
  // date opened."
  $effect(() => {
    backButtonEl?.focus({ preventScroll: true });

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      // Minimal focus trap: the day list underneath stays mounted and
      // visible (Boundaries), not `inert`, so without this a Tab/Shift+Tab
      // from the Back button would leak focus onto a day row dimmed behind
      // the scrim -- not "the dialog's contents," which is what a keyboard
      // user tabbing through an open dialog should stay inside. The Back
      // button is this dialog's only focusable control (read-only, no Mark
      // Complete/Edit UI), so keeping focus pinned there for every Tab press
      // is a complete trap, not a partial one that only handles some cases.
      if (event.key === 'Tab') {
        event.preventDefault();
        backButtonEl?.focus();
      }
    }

    window.addEventListener('keydown', handleKeydown);
    return () => {
      window.removeEventListener('keydown', handleKeydown);
    };
  });
</script>

<!--
  The scrim is a pointer-only convenience close (per the I/O matrix: "Close
  via Back, scrim tap, or Escape") -- it carries no keyboard affordance of
  its own because Back and Escape (both real, focusable/keyboard-triggered
  controls handled elsewhere in this component) already cover every
  keyboard path to the same action, so it's deliberately not given a
  redundant interactive role/tabindex/keyboard handler.
-->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="scrim" onclick={onClose}>
  <div
    class="panel"
    role="dialog"
    aria-modal="true"
    aria-labelledby="workout-detail-title"
    tabindex="-1"
    onclick={(event) => event.stopPropagation()}
  >
    <button type="button" class="back-button" bind:this={backButtonEl} onclick={onClose}>
      ← Back
    </button>
    <h2 id="workout-detail-title" class="title">{title}</h2>
    {#if isRestDay}
      <p class="empty-copy">Nothing scheduled to log yet</p>
    {:else}
      {#if dayView.duration || dayView.distance}
        <div class="stats">
          {#if dayView.duration}
            <WorkoutDetailStat value={dayView.duration} label="Duration" />
          {/if}
          {#if dayView.distance}
            <WorkoutDetailStat value={dayView.distance} label="Distance" />
          {/if}
        </div>
      {:else}
        <p class="empty-copy">No stats logged for this workout</p>
      {/if}
    {/if}
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    /* Stops short of the tab bar, rather than covering the full viewport --
       EXPERIENCE.md's tab-bar Component Pattern is explicit that it
       "persists across both tabs; never hidden or covered by a modal," and
       this is this app's first modal. Matches App.svelte's own `main`
       bottom-padding calc so the two stay in sync with the same tab-bar
       height and gesture-nav inset. */
    bottom: calc(var(--tab-bar-height) + env(safe-area-inset-bottom, 0px));
    /* This codebase's first z-index usage. A later overlay (e.g. an Edit
       form, or a toast/celebration overlay) should coordinate its own
       z-index against this value rather than picking an arbitrary one. */
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
    margin: 0 0 var(--space-7);
    font-family: var(--type-title-font-family);
    font-size: var(--type-title-size);
    font-weight: var(--type-title-weight);
    color: var(--text-primary);
  }

  .empty-copy {
    margin: 0;
    font-family: var(--type-body-font-family);
    font-size: var(--type-body-size);
    font-weight: var(--type-body-weight);
    line-height: var(--type-body-line-height);
    color: var(--text-secondary);
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(7.5rem, 1fr));
    gap: var(--space-4);
  }
</style>
