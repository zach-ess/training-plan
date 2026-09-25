// Story 2.3 -- regression coverage (Epic 2 retro action item 8's test
// harness) for two things this story's I/O matrix specifically calls out as
// easy to silently regress:
//
// 1. `replaceLogEntry`'s AD-9 full-overwrite contract -- omitted fields are
//    genuinely absent from the written record (never `null`/`''`), a field
//    present on a *prior* record but omitted from *this* call disappears
//    (proving this is a real overwrite, not a merge like `setCompleted`), and
//    `completed` is unconditionally `true` regardless of the prior value.
// 2. The "Other" free-text type value's case-fold + trim normalization, and
//    the write-error/Retry path retaining typed values -- both exercised
//    through the real `WorkoutEditForm` component, the same
//    render/fireEvent style `WorkoutDetail.test.ts` already established.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import WorkoutEditForm from './WorkoutEditForm.svelte';
import { logStore, replaceLogEntry, setCompleted } from '../data/logStore.svelte';
import type { Workout } from '../domain/parsePlan';

// Unlike WorkoutDetail.test.ts's own suite (where every render's
// `button-primary` label happens to have already mutated away from "Mark
// Complete" by the time a later test's fresh instance is queried, so stale
// unmounted-but-not-removed instances never collide), this form's own
// "Cancel"/"Save"/"Duration" accessible names never change across a render's
// lifetime -- so, without explicit cleanup, `@testing-library/svelte`'s
// default no-auto-cleanup behavior (this project doesn't import its
// `/vitest` auto-cleanup entry point) would leave every prior test's
// still-mounted form in the document, and a later `getByRole`/`getByLabelText`
// call would find more than one match. Cleaning up after every test avoids
// that without changing this project's shared vitest setup.
afterEach(() => {
  cleanup();
});

describe('replaceLogEntry (AD-9 full-overwrite write)', () => {
  it('omits every optional key when fields is empty, and unconditionally sets completed: true', () => {
    const date = '2099-02-01';
    const result = replaceLogEntry(date, {});

    expect(result.ok).toBe(true);
    const entry = logStore.entries[date];
    expect(entry).toBeDefined();
    expect(entry.completed).toBe(true);
    expect('type' in entry).toBe(false);
    expect('duration' in entry).toBe(false);
    expect('distance' in entry).toBe(false);
    expect('notes' in entry).toBe(false);
  });

  it('fully overwrites rather than merging: a field on the prior entry but omitted from this call disappears', () => {
    const date = '2099-02-02';
    const workout: Workout = { date, type: 'Run', duration: '30 min', distance: '3 mi' };
    setCompleted(date, true, workout);
    expect(logStore.entries[date]?.type).toBe('Run');
    expect(logStore.entries[date]?.duration).toBe('30 min');

    replaceLogEntry(date, { notes: 'felt good' });

    const entry = logStore.entries[date];
    expect(entry.notes).toBe('felt good');
    expect('type' in entry).toBe(false);
    expect('duration' in entry).toBe(false);
    expect('distance' in entry).toBe(false);
  });

  it('sets completed: true even when the prior entry had completed: false', () => {
    const date = '2099-02-03';
    setCompleted(date, false, { date, type: 'Run' });
    expect(logStore.entries[date]?.completed).toBe(false);

    replaceLogEntry(date, { type: 'Bike' });

    expect(logStore.entries[date]?.completed).toBe(true);
    expect(logStore.entries[date]?.type).toBe('Bike');
  });
});

describe('WorkoutEditForm', () => {
  it('FR3/UX-DR15: normalizes a typed "Other" value (case-fold + trim) before write', async () => {
    const date = '2099-02-04';
    const onSaved = vi.fn();
    const { getByLabelText, getByRole } = render(WorkoutEditForm, {
      props: { date, workout: undefined, onSaved, onCancel: vi.fn() },
    });

    await fireEvent.change(getByLabelText('Type'), { target: { value: 'Other' } });
    await fireEvent.input(getByLabelText('Other workout type'), { target: { value: 'Yoga ' } });
    await fireEvent.click(getByRole('button', { name: 'Save' }));

    expect(logStore.entries[date]?.type).toBe('yoga');
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('omits type entirely when Other is selected but left blank', async () => {
    const date = '2099-02-05';
    const { getByLabelText, getByRole } = render(WorkoutEditForm, {
      props: { date, workout: undefined, onSaved: vi.fn(), onCancel: vi.fn() },
    });

    await fireEvent.change(getByLabelText('Type'), { target: { value: 'Other' } });
    await fireEvent.click(getByRole('button', { name: 'Save' }));

    expect('type' in (logStore.entries[date] ?? {})).toBe(false);
    expect(logStore.entries[date]?.completed).toBe(true);
  });

  it('I/O matrix: saving with every field blank omits all optional keys and still sets completed: true', async () => {
    const date = '2099-02-06';
    const onSaved = vi.fn();
    const { getByRole } = render(WorkoutEditForm, {
      props: { date, workout: undefined, onSaved, onCancel: vi.fn() },
    });

    await fireEvent.click(getByRole('button', { name: 'Save' }));

    const entry = logStore.entries[date];
    expect(entry.completed).toBe(true);
    expect('type' in entry).toBe(false);
    expect('duration' in entry).toBe(false);
    expect('distance' in entry).toBe(false);
    expect('notes' in entry).toBe(false);
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('I/O matrix: pre-fills from the Plan (type/duration/distance) when no LogEntry exists yet, notes blank', () => {
    const date = '2099-02-10';
    const workout: Workout = { date, type: 'Run', duration: '30 min', distance: '3 mi' };

    const { getByLabelText } = render(WorkoutEditForm, {
      props: { date, workout, onSaved: vi.fn(), onCancel: vi.fn() },
    });

    expect((getByLabelText('Type') as HTMLSelectElement).value).toBe('Run');
    expect((getByLabelText('Duration') as HTMLInputElement).value).toBe('30 min');
    expect((getByLabelText('Distance') as HTMLInputElement).value).toBe('3 mi');
    expect((getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('');
  });

  it('pre-fills from the existing LogEntry, not the Plan, when both exist', () => {
    const date = '2099-02-08';
    const workout: Workout = { date, type: 'Run', duration: '30 min', distance: '3 mi' };
    // A LogEntry that only ever recorded a duration -- no type/distance/notes.
    replaceLogEntry(date, { duration: '45 min' });

    const { getByLabelText } = render(WorkoutEditForm, {
      props: { date, workout, onSaved: vi.fn(), onCancel: vi.fn() },
    });

    expect((getByLabelText('Duration') as HTMLInputElement).value).toBe('45 min');
    // The LogEntry's own values win entirely (AD-1/AD-8) -- the Plan's type
    // and distance are not used as a per-field fallback just because this
    // particular LogEntry happens not to have them.
    expect((getByLabelText('Type') as HTMLSelectElement).value).toBe('');
    expect((getByLabelText('Distance') as HTMLInputElement).value).toBe('');
  });

  it('on a failed save, typed values are retained and Retry re-attempts the same write', async () => {
    const date = '2099-02-07';
    const onSaved = vi.fn();
    const originalSetItem = Storage.prototype.setItem;
    let shouldFail = true;
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      ...args: Parameters<typeof originalSetItem>
    ) {
      if (shouldFail) {
        shouldFail = false;
        throw new DOMException('quota exceeded (simulated)', 'QuotaExceededError');
      }
      return originalSetItem.apply(this, args);
    });

    const { getByLabelText, getByRole, findByRole } = render(WorkoutEditForm, {
      props: { date, workout: undefined, onSaved, onCancel: vi.fn() },
    });

    const durationInput = getByLabelText('Duration') as HTMLInputElement;
    await fireEvent.input(durationInput, { target: { value: '45 min' } });
    await fireEvent.click(getByRole('button', { name: 'Save' }));

    expect(await findByRole('alert')).toBeTruthy();
    expect(durationInput.value).toBe('45 min');
    expect(onSaved).not.toHaveBeenCalled();
    expect(logStore.entries[date]).toBeUndefined();

    await fireEvent.click(getByRole('button', { name: 'Retry' }));

    expect(logStore.entries[date]?.duration).toBe('45 min');
    expect(onSaved).toHaveBeenCalledTimes(1);

    spy.mockRestore();
  });

  it('Cancel never writes anything', async () => {
    const date = '2099-02-09';
    const onCancel = vi.fn();
    const { getByLabelText, getByRole } = render(WorkoutEditForm, {
      props: { date, workout: undefined, onSaved: vi.fn(), onCancel },
    });

    await fireEvent.input(getByLabelText('Duration'), { target: { value: '20 min' } });
    await fireEvent.click(getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(logStore.entries[date]).toBeUndefined();
  });
});
