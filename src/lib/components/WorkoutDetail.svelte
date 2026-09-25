<script lang="ts">
  // Story 2.1 -- WorkoutDetail: the drill-down opened by tapping a day row
  // (Home's tap-to-drill-down primitive, "the single UX pattern [Zach] most
  // wants preserved" -- EXPERIENCE.md). Built as an overlay, not a
  // route/view swap, so App.svelte's day list stays mounted underneath and
  // `dayRange`/`activeTab`/scroll position are never touched by opening or
  // closing this component (this story's Boundaries).
  //
  // Story 2.2 -- no longer read-only: reads the real LogEntry for `date` off
  // the new Data Store, renders the `ButtonPrimary` Mark Complete/Incomplete
  // toggle (AD-9's `setCompleted`), and mounts `CompletionCelebration`
  // momentarily after a successful Mark Complete write (never on Mark
  // Incomplete, never on a failed write).
  //
  // `workout` is a reactive prop (App.svelte derives it from
  // `workoutsByDate.get(selectedDate)`), so a background Plan refetch that
  // changes or removes this date's Workout while the dialog is open updates
  // `dayView` in place via `$derived` -- the same reactive pattern Home's own
  // day list already relies on (I/O matrix). `logEntry` is likewise
  // `$derived` off the Data Store, so a successful `setCompleted` write
  // (which reassigns `logStore.entries`) re-renders `dayView`/`ButtonPrimary`
  // in place too.
  // Story 2.3 -- adds the Edit trigger and `WorkoutEditForm`. `editing` swaps
  // this dialog's own body between the existing view-mode markup and the
  // form in place (Boundaries: "one dialog, one focus trap," never a second
  // `role="dialog"` stacked on top) -- opening/closing Edit never touches
  // this dialog's own focus-trap effect below. Back and Escape, while
  // `editing` is true, are rerouted to `handleEditCancel()` instead of
  // `onClose()` so a mid-edit Back/Escape returns to view mode (discarding
  // the in-progress edit) rather than silently closing the whole dialog out
  // from under it. The Edit trigger itself renders even on a rest day
  // (`isRestDay`), unlike `ButtonPrimary`, so a completely unplanned day can
  // still be logged from here (AD-8's orphaned-log case).
  import { tick } from 'svelte';
  import { getDayView } from '../domain/getDayView';
  import type { Workout } from '../domain/parsePlan';
  import { getLogEntry, setCompleted } from '../data/logStore.svelte';
  import WorkoutDetailStat from './WorkoutDetailStat.svelte';
  import ButtonPrimary from './ButtonPrimary.svelte';
  import CompletionCelebration from './CompletionCelebration.svelte';
  import WorkoutEditForm from './WorkoutEditForm.svelte';

  let { date, workout, onClose }: { date: string; workout: Workout | undefined; onClose: () => void } =
    $props();

  const logEntry = $derived(getLogEntry(date));
  const dayView = $derived(getDayView(workout, logEntry));
  const isRestDay = $derived(dayView.kind === 'empty');
  // `||`, not `??` -- mirrors DayRowCard's own "never blank" rule: a Workout
  // whose `type` is present but an empty string must still fall back to
  // "Workout" rather than rendering blank.
  const title = $derived(isRestDay ? 'Rest Day' : dayView.type || 'Workout');
  const isCompleted = $derived(dayView.completed === true);

  // Story 2.2 -- Mark Complete/Incomplete write state. `writeErrorReason` is
  // `undefined` whenever the last write attempt (or no attempt yet) didn't
  // fail; a truthy value shows the plain-voice retry error and, per this
  // story's Boundaries, leaves `logStore`'s (and so `dayView`'s) in-memory
  // state exactly as it was -- there is nothing to roll back here.
  let writeErrorReason = $state<'quota-exceeded' | 'write-error' | undefined>(undefined);
  // Whether `CompletionCelebration` is currently mounted. Only ever set
  // `true` right after a *successful* write that flips completion on (never
  // on Mark Incomplete, never on a failed write) -- `CompletionCelebration`
  // itself flips this back via `onSettled` once its single-shot playback
  // finishes, unmounting it.
  let celebrating = $state(false);

  function handleToggleComplete() {
    // Captured before anything else changes: whether this call originated
    // from the Retry button (rather than the main ButtonPrimary toggle).
    // `writeErrorReason` clearing below unmounts the `{#if writeErrorReason}`
    // block containing the just-clicked, currently-focused `.retry-button`,
    // which would otherwise silently drop focus to `document.body`.
    const startedFromRetry = document.activeElement === retryButtonEl;
    writeErrorReason = undefined;
    const wasCompleted = isCompleted;
    // Mirrors epics.md's own call shapes exactly: Mark Complete passes the
    // current Workout (AD-1's value-freeze, consulted only on first
    // creation); Mark Incomplete never does, since `setCompleted` never
    // touches `duration`/`distance`/`type`/`notes` on an existing entry
    // regardless (AD-9) -- omitting it here just matches the spec's own
    // stated call, rather than relying on that internal no-op.
    const result = wasCompleted ? setCompleted(date, false) : setCompleted(date, true, workout);
    if (!result.ok) {
      writeErrorReason = result.reason;
      return;
    }
    // Retry-success path: move focus to something meaningful instead of
    // letting it drop to `document.body` when the retry button's containing
    // block unmounts above. Falls back to backButtonEl if markButtonEl isn't
    // focusable right now (e.g. the completion branch below is about to
    // disable it too).
    if (startedFromRetry) {
      if (markButtonEl && !markButtonEl.disabled) {
        markButtonEl.focus();
      } else {
        backButtonEl?.focus();
      }
    }
    // Completion Feedback fires only on a successful write that actually
    // turns completion *on* -- never on Mark Incomplete (this story's
    // Boundaries/UX-DR7).
    if (!wasCompleted) {
      // `celebrating = true` below disables markButtonEl via its
      // `disabled={celebrating}` binding; a browser moves focus to
      // `document.body` when the currently-focused element becomes disabled.
      // Move focus to backButtonEl first so it never silently drops there.
      if (document.activeElement === markButtonEl) {
        backButtonEl?.focus();
      }
      celebrating = true;
    }
  }

  function handleCelebrationSettled() {
    celebrating = false;
  }

  // Story 2.3 -- whether `WorkoutEditForm` is swapped in for the view-mode
  // markup below. `editButtonEl` is the Edit trigger's own DOM ref, refocused
  // (via `tick()` below, since the button it targets doesn't exist in the DOM
  // yet in the same synchronous tick a state flip happens in -- mirrors
  // App.svelte's `handleSelect` doing the same for `panel-${tab}`) whenever
  // the form closes back to view mode, whether by Save success or Cancel, so
  // focus never silently drops to `document.body` when the form's own
  // controls unmount.
  let editing = $state(false);
  let editButtonEl = $state<HTMLButtonElement | undefined>();

  async function handleEditClick() {
    editing = true;
    // A stale write-error banner from an earlier failed Mark Complete/
    // Incomplete attempt must never resurface once Edit is opened -- clear
    // it here so it can't reappear in view mode after this editing session
    // ends (Save success or Cancel), since neither of those touches Mark
    // Complete's own write path at all.
    writeErrorReason = undefined;
    // `.actions` (including this just-clicked, currently-focused button)
    // unmounts once `editing` flips true -- `tick()` first, since
    // `WorkoutEditForm`'s own fields don't exist in the DOM yet in this same
    // synchronous tick, then move focus into its first control (the Type
    // select) rather than letting it drop to `document.body`.
    await tick();
    panelEl?.querySelector<HTMLElement>('#edit-type')?.focus();
  }

  async function handleEditSaved() {
    editing = false;
    await tick();
    // Focus `backButtonEl`, not `editButtonEl`: `celebrating = true` below
    // disables `editButtonEl` via its own `disabled={celebrating}` binding
    // (same as `markButtonEl`'s), so focusing it here would immediately drop
    // focus to `document.body` the instant it becomes disabled -- mirrors
    // `handleToggleComplete`'s own guard above for the exact same hazard.
    backButtonEl?.focus();
    // Completion Feedback fires unconditionally on every successful Edit
    // save (this story's Boundaries) -- unlike Mark Complete's `celebrating`
    // flip above, this is never gated on "did this newly turn completion on."
    // `replaceLogEntry` itself already guaranteed `completed: true` on the
    // just-written record before this callback ever runs.
    celebrating = true;
  }

  async function handleEditCancel() {
    editing = false;
    await tick();
    editButtonEl?.focus();
  }

  let backButtonEl = $state<HTMLButtonElement | undefined>();
  let markButtonEl = $state<HTMLButtonElement | undefined>();
  let retryButtonEl = $state<HTMLButtonElement | undefined>();
  let panelEl = $state<HTMLDivElement | undefined>();

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
        // Mid-edit, Escape returns to view mode (discarding the in-progress
        // edit) rather than closing the whole dialog out from under an open
        // form -- same reasoning as the Back button's own `onclick` below.
        if (editing) {
          handleEditCancel();
        } else {
          onClose();
        }
        return;
      }
      // Focus trap: the day list underneath stays mounted and visible
      // (Boundaries), not `inert`, so without this a Tab/Shift+Tab from this
      // dialog's controls would leak focus onto a day row dimmed behind the
      // scrim -- not "the dialog's contents," which is what a keyboard user
      // tabbing through an open dialog should stay inside.
      //
      // Story 2.2 -- this dialog can have several focusable controls
      // (`ButtonPrimary` whenever `dayView.kind !== 'empty'`, plus a Retry
      // button whenever the last write failed), so this cycles Tab/Shift+Tab
      // between whichever controls actually exist right now.
      //
      // Story 2.3 -- generalized from a hardcoded three-ref array
      // (`[backButtonEl, markButtonEl, retryButtonEl]`) to a live query over
      // `panelEl`'s current DOM: `WorkoutEditForm` (Boundaries: "no second
      // `role="dialog"`/focus trap for the edit form -- it lives inside
      // WorkoutDetail's existing dialog") adds a `<select>`, several
      // `<input>`s, a `<textarea>`, and its own Save/Cancel/Retry buttons --
      // enumerating each of those individually here, on top of the existing
      // three, would make this trap one hardcoded-list edit away from
      // silently stranding a field Tab-unreachable every time either
      // component's controls change. A live query naturally covers whatever
      // is actually mounted and focusable right now, in both view mode and
      // edit mode, with no separate list to keep in sync.
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
    bind:this={panelEl}
    onclick={(event) => event.stopPropagation()}
  >
    <!-- Mid-edit, Back returns to view mode (discarding the in-progress
         edit) instead of bypassing `editing` and closing the whole dialog
         out from under the open form -- same reasoning as Escape above. -->
    <button
      type="button"
      class="back-button"
      bind:this={backButtonEl}
      onclick={() => (editing ? handleEditCancel() : onClose())}
    >
      ← Back
    </button>
    <h2 id="workout-detail-title" class="title">{title}</h2>
    <!-- Story 2.3 -- `editing` swaps this whole body between the existing
         view-mode markup and `WorkoutEditForm`, in place, without touching
         this dialog's own `role="dialog"`/focus trap (Boundaries). -->
    {#if editing}
      <WorkoutEditForm {date} {workout} onSaved={handleEditSaved} onCancel={handleEditCancel} />
    {:else}
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
      <!-- Story 2.3 -- this row itself now always renders, even on a rest
           day (`isRestDay`), so the Edit trigger is reachable there too
           (Boundaries: "not gated behind !isRestDay the way ButtonPrimary
           is") -- only `ButtonPrimary` and the Mark Complete write-error
           stay scoped to `!isRestDay`, same as Story 2.2. -->
      <div class="actions">
        <button
          type="button"
          class="edit-trigger"
          aria-label="Edit"
          bind:this={editButtonEl}
          disabled={celebrating}
          onclick={handleEditClick}
        >
          <!-- Placeholder inline SVG icon (no icon spec exists anywhere in
               the UX docs or mockups) -- same convention as TabBar.svelte's
               own header comment: `stroke="currentColor"`/no fill, so this
               icon inherits color from the button's own `color` property. -->
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M12 20h9" />
            <path
              d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"
            />
          </svg>
        </button>
        {#if !isRestDay}
          <ButtonPrimary
            completed={isCompleted}
            disabled={celebrating}
            onclick={handleToggleComplete}
            bind:buttonEl={markButtonEl}
          />
          {#if writeErrorReason}
            <p class="write-error" role="alert">
              {writeErrorReason === 'quota-exceeded'
                ? "Couldn't save — your device storage is full. Free up space and try again."
                : "Couldn't save — something went wrong. Try again."}
              <button
                type="button"
                class="retry-button"
                bind:this={retryButtonEl}
                onclick={handleToggleComplete}
              >
                Retry
              </button>
            </p>
          {/if}
        {/if}
      </div>
    {/if}
    <!-- Epic 2 retro finding F3 (2026-09-24): this used to be a sibling of
         `.panel` (outside this `role="dialog" aria-modal="true"` element),
         so its `aria-live="polite"` announcement lived outside the dialog's
         own accessible-tree boundary -- inconsistent with the `role="alert"`
         write-error block above, which has always been correctly nested
         in here. Moved inside `.panel` so the completion announcement is
         unambiguously part of the modal's own content for AT users with
         focus trapped inside it. -->
    {#if celebrating}
      <CompletionCelebration onSettled={handleCelebrationSettled} />
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

  .actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    margin-top: var(--space-7);
  }

  /* Story 2.3 -- Edit trigger. An icon-only button (no visible text label,
     hence `aria-label="Edit"` above) -- sized to the same 48dp-equivalent
     minimum tap target as every other interactive control in this file, but
     square/self-sized rather than full-width like `button-primary`. */
  .edit-trigger {
    all: unset;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    align-self: flex-start;
    width: 3rem;
    height: 3rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: var(--text-secondary);
  }

  .edit-trigger:focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: 2px;
  }

  .edit-trigger:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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
