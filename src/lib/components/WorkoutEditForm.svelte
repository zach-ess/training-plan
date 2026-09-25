<script lang="ts">
  // Story 2.3 -- WorkoutEditForm: the form `WorkoutDetail` swaps in for its
  // own view-mode markup when `editing` is true (this story's Boundaries --
  // one dialog, one focus trap, no second `role="dialog"` here). Lets Zach
  // record what actually happened for a day when it differs from the Plan,
  // or log a completely unplanned day (a rest day with neither a Workout nor
  // a LogEntry) from scratch.
  //
  // Every field is independently optional (Boundaries) -- there is
  // deliberately no required-field visual treatment anywhere below, and Save
  // is never blocked regardless of what is or isn't filled in.
  //
  // Pre-fill precedence mirrors `getDayView`'s own AD-8 rule, applied here to
  // form fields instead of read-only display: if a LogEntry exists at all for
  // `date`, *its own* stored values win outright (even for a field the
  // LogEntry itself doesn't have -- that field opens blank, it does not fall
  // back to the Plan's value for it, per AD-1's value-freeze). Only when no
  // LogEntry exists yet does the Plan's Workout fill the form; when neither
  // exists (a rest day with nothing logged), every field opens blank. Read
  // once at mount via a direct `getLogEntry(date)` call, not `$derived` --
  // this form's in-progress edits are a stable local copy for the duration of
  // this editing session, never reactively overwritten by some other
  // in-memory change to the Data Store while the form is still open.
  import { untrack } from 'svelte';
  import { getLogEntry, replaceLogEntry, type LogEntryFields } from '../data/logStore.svelte';
  import type { Workout } from '../domain/parsePlan';

  // The closed preset list (FR3, UX-DR15, confirmed with Zach 2026-09-17) --
  // exactly these five, plus "Other" below revealing free text for anything
  // not on this list.
  const TYPE_PRESETS = ['Run', 'Bike', 'Lift', 'Mobility', 'Stretch'] as const;

  let {
    date,
    workout,
    onSaved,
    onCancel,
  }: {
    date: string;
    workout: Workout | undefined;
    onSaved: () => void;
    onCancel: () => void;
  } = $props();

  // `untrack` (App.svelte's own established convention for "read this
  // reactive value exactly once, right now, not as an ongoing subscription"):
  // `date`/`workout` are reactive props, but this whole block is a one-time
  // snapshot read at mount, by design (see header comment above) -- without
  // `untrack`, Svelte's compiler flags each of these reads with its
  // `state_referenced_locally` warning, since a plain `const` built from a
  // reactive prop looks, at a glance, like it might have been meant to stay
  // reactive instead.
  const { prefillType, prefillDuration, prefillDistance, prefillNotes } = untrack(() => {
    const logEntry = getLogEntry(date);
    const hasLogEntry = logEntry !== undefined;
    return {
      prefillType: hasLogEntry ? logEntry.type : workout?.type,
      prefillDuration: (hasLogEntry ? logEntry.duration : workout?.duration) ?? '',
      prefillDistance: (hasLogEntry ? logEntry.distance : workout?.distance) ?? '',
      // Workout (the Plan's own shape) never carries notes -- only ever read
      // off an actual LogEntry, so there's no Workout fallback to consider.
      prefillNotes: logEntry?.notes ?? '',
    };
  });

  function isPreset(value: string): value is (typeof TYPE_PRESETS)[number] {
    return (TYPE_PRESETS as readonly string[]).includes(value);
  }

  // The dropdown's own closed value set is the five presets plus "Other";
  // `''` is this form's own not-a-preset "no type" selection, letting type
  // stay genuinely optional the same as every other field (Boundaries) --
  // no on-screen dropdown mechanism is dictated anywhere in the UX docs
  // (EXPERIENCE.md marks it an explicit `[ASSUMPTION: ...]`), so a blank
  // leading option is this story's own resolution of that gap.
  let typeSelection = $state<string>(
    prefillType === undefined ? '' : isPreset(prefillType) ? prefillType : 'Other',
  );
  // Only ever meaningful while `typeSelection === 'Other'` -- pre-filled with
  // the stored/planned type verbatim (not yet normalized) so Zach sees
  // exactly what's on record, with normalization applied only at Save time.
  let otherText = $state(prefillType !== undefined && !isPreset(prefillType) ? prefillType : '');

  let duration = $state(prefillDuration);
  let distance = $state(prefillDistance);
  let notes = $state(prefillNotes);

  // Mirrors WorkoutDetail's own write-error state shape exactly (AD-3/AD-4):
  // `undefined` whenever the last attempt (or no attempt yet) didn't fail.
  // No local `retryButtonEl`/focus bookkeeping is needed here the way
  // WorkoutDetail's own Mark Complete Retry has: a successful Retry here
  // calls `onSaved()`, which (in `WorkoutDetail`) unmounts this whole form
  // and, past a `tick()`, refocuses its Edit trigger button -- that later
  // refocus already supersedes whatever happens to this block's own Retry
  // button in between, so there is nothing left here to track separately.
  let writeErrorReason = $state<'quota-exceeded' | 'write-error' | undefined>(undefined);

  /** Builds the `fields` object `replaceLogEntry` writes, from this form's
   * current typed values -- every key is included only if that field
   * resolves to a genuinely non-blank value, so a field left blank (or
   * cleared back to blank) is omitted entirely rather than written as `''`
   * (AD-9's omit-key convention). Trimmed uniformly across all four fields --
   * a whitespace-only value is treated the same as a truly blank one. */
  function buildFields(): LogEntryFields {
    const fields: LogEntryFields = {};

    let resolvedType: string | undefined;
    if (typeSelection === 'Other') {
      // "Other" free text is normalized -- case-fold + trim -- before write
      // (FR3, UX-DR15): "Yoga " becomes "yoga".
      const normalized = otherText.trim().toLowerCase();
      resolvedType = normalized === '' ? undefined : normalized;
    } else if (typeSelection !== '') {
      resolvedType = typeSelection;
    }
    if (resolvedType !== undefined) {
      fields.type = resolvedType;
    }

    const trimmedDuration = duration.trim();
    if (trimmedDuration !== '') {
      fields.duration = trimmedDuration;
    }
    const trimmedDistance = distance.trim();
    if (trimmedDistance !== '') {
      fields.distance = trimmedDistance;
    }
    const trimmedNotes = notes.trim();
    if (trimmedNotes !== '') {
      fields.notes = trimmedNotes;
    }

    return fields;
  }

  function handleSave() {
    writeErrorReason = undefined;
    const result = replaceLogEntry(date, buildFields());
    if (!result.ok) {
      // On failure, every typed value above is left exactly as it is --
      // nothing here clears or resets `typeSelection`/`otherText`/`duration`/
      // `distance`/`notes` (Boundaries: "the form's typed values are
      // retained exactly as entered").
      writeErrorReason = result.reason;
      return;
    }
    onSaved();
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    handleSave();
  }

  function handleCancel() {
    onCancel();
  }
</script>

<form class="workout-edit-form" onsubmit={handleSubmit}>
  <div class="field">
    <label class="field-label" for="edit-type">Type</label>
    <select id="edit-type" class="field-input" bind:value={typeSelection}>
      <option value="">No type selected</option>
      {#each TYPE_PRESETS as preset (preset)}
        <option value={preset}>{preset}</option>
      {/each}
      <option value="Other">Other</option>
    </select>
    {#if typeSelection === 'Other'}
      <input
        type="text"
        class="field-input"
        aria-label="Other workout type"
        placeholder="Enter a workout type"
        bind:value={otherText}
      />
    {/if}
  </div>

  <div class="field">
    <label class="field-label" for="edit-duration">Duration</label>
    <input
      id="edit-duration"
      class="field-input"
      type="text"
      placeholder="e.g. 30 min"
      bind:value={duration}
    />
  </div>

  <div class="field">
    <label class="field-label" for="edit-distance">Distance</label>
    <input
      id="edit-distance"
      class="field-input"
      type="text"
      placeholder="e.g. 5 miles"
      bind:value={distance}
    />
  </div>

  <div class="field">
    <label class="field-label" for="edit-notes">Notes</label>
    <textarea id="edit-notes" class="field-input" placeholder="Optional notes" bind:value={notes}
    ></textarea>
  </div>

  {#if writeErrorReason}
    <p class="write-error" role="alert">
      {writeErrorReason === 'quota-exceeded'
        ? "Couldn't save — your device storage is full. Free up space and try again."
        : "Couldn't save — something went wrong. Try again."}
      <button type="button" class="retry-button" onclick={handleSave}> Retry </button>
    </p>
  {/if}

  <div class="form-actions">
    <button type="button" class="cancel-button" onclick={handleCancel}>Cancel</button>
    <button type="submit" class="save-button">Save</button>
  </div>
</form>

<style>
  /* DESIGN.md's `workout-edit-form` component tokens (this story's
     Boundaries): `{colors.surface}` background, `{colors.border}` outline,
     `{rounded.sm}` corners, `{typography.caption}` labels,
     `{typography.body}` input text. */
  .workout-edit-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    box-sizing: border-box;
    padding: var(--space-6);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .field-label {
    font-family: var(--type-caption-font-family);
    font-size: var(--type-caption-size);
    font-weight: var(--type-caption-weight);
    color: var(--text-secondary);
  }

  .field-input {
    box-sizing: border-box;
    width: 100%;
    min-height: 3rem; /* 48dp-equivalent minimum tap target */
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

  textarea.field-input {
    min-height: 5rem;
    resize: vertical;
  }

  .field-input:focus-visible {
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

  .form-actions {
    display: flex;
    gap: var(--space-5);
  }

  .cancel-button,
  .save-button {
    all: unset;
    box-sizing: border-box;
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 3rem; /* 48dp-equivalent minimum tap target */
    padding: var(--space-5) var(--space-7);
    border-radius: var(--radius-sm);
    cursor: pointer;
    text-align: center;
    font-family: var(--type-row-label-font-family);
    font-size: var(--type-row-label-size);
    font-weight: var(--type-row-label-weight);
  }

  .cancel-button {
    border: 1px solid var(--text-primary);
    background: transparent;
    color: var(--text-primary);
  }

  .save-button {
    border: 1px solid var(--accent-primary);
    background: var(--accent-primary);
    color: var(--surface);
  }

  .cancel-button:focus-visible,
  .save-button:focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: 2px;
  }
</style>
