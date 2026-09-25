// Epic 2 retro (2026-09-24), action item 8 (test-harness decision):
// regression coverage for WorkoutDetail's focus-management logic -- the
// Tab-cycle focus trap and the focus-restoration paths around Mark
// Complete/Retry -- all previously verified only by hand or by an ad hoc
// live-browser (Playwright) script during Story 2.2's fresh-session review.
// These specific behaviors depend only on the DOM `disabled` property and
// ordinary element.focus() calls, neither of which needs real browser
// layout/visibility semantics, so jsdom is a faithful enough environment for
// them (unlike hidden/inert-interacting focus bugs -- see this file's
// sibling note in the retro doc's test-harness decision for why those stay
// Playwright-only).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import WorkoutDetail from './WorkoutDetail.svelte';
import { logStore } from '../data/logStore.svelte';
import type { Workout } from '../domain/parsePlan';

const workout: Workout = { date: '2099-01-01', type: 'Run', duration: '30 min' };

function pressTab(shiftKey = false) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true }));
}

describe('WorkoutDetail focus management', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Each test uses its own workout.date (see below), so no cross-test
    // localStorage collision -- no explicit reset needed here.
  });

  // Story 2.3 -- every WorkoutDetail render now includes an "Edit" button
  // unconditionally (rest day or not), and its accessible name never changes
  // across a render's lifetime the way "Mark Complete"'s text does once
  // clicked. Without explicit cleanup, this project's default no-auto-cleanup
  // setup (no `@testing-library/svelte/vitest` import) would leave every
  // prior test's still-mounted instance in the document, and a later
  // `getByRole('button', { name: 'Edit' })` would match more than one -- the
  // same class of gap WorkoutEditForm.test.ts's own header comment already
  // documents for its "Cancel"/"Save"/field-label queries.
  afterEach(() => {
    cleanup();
  });

  it('Fix1 (Story 2.2 fresh-review): moves focus to Back instead of letting it drop to <body> when celebrating disables the just-tapped Mark button', async () => {
    const date = '2099-01-02';
    const onClose = vi.fn();
    const { getByRole } = render(WorkoutDetail, { props: { date, workout: { ...workout, date }, onClose } });

    const markButton = getByRole('button', { name: 'Mark Complete' });
    markButton.focus();
    await fireEvent.click(markButton);

    // Right after the click, `celebrating` flips true and disables
    // markButton synchronously in the same tick -- assert focus already
    // moved before any timer fires.
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toHaveClass('back-button');
  });

  it('Fix2 (Story 2.2 fresh-review): Tab never even attempts to focus the disabled Mark button while celebrating', async () => {
    // Asserts on the *attempt*, via a focus() spy, rather than only the
    // final document.activeElement: jsdom's own .focus() silently no-ops on
    // a disabled element and leaves the prior focus target in place (real
    // browsers do the same), which would make the reverted, un-filtered
    // version of this code -- `focusables[nextIndex]?.focus()` landing on
    // the disabled Mark button -- produce the *same observable end state*
    // as the fix in this component's specific two-button layout (Back +
    // disabled Mark, no Retry button rendered), silently masking the bug an
    // end-state-only assertion was first written with here. Caught live
    // while building this test by deliberately reverting the fix and
    // confirming the naive version of this test still passed.
    const date = '2099-01-03';
    const onClose = vi.fn();
    const { getByRole } = render(WorkoutDetail, { props: { date, workout: { ...workout, date }, onClose } });

    const markButton = getByRole('button', { name: 'Mark Complete' }) as HTMLButtonElement;
    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus');
    await fireEvent.click(markButton);
    expect(markButton).toBeDisabled();

    focusSpy.mockClear(); // ignore Fix1's own focus(backButton) call from the click above
    pressTab();
    const focusedElements = focusSpy.mock.instances as HTMLElement[];
    expect(focusedElements).not.toContain(markButton);

    focusSpy.mockRestore();
  });

  it('Fix3 (Story 2.2 fresh-review): a successful Retry moves focus to Mark or Back, not <body>', async () => {
    const date = '2099-01-04';
    const onClose = vi.fn();

    let shouldFail = true;
    const originalSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, ...args) {
      if (shouldFail) {
        shouldFail = false;
        throw new DOMException('quota exceeded (simulated)', 'QuotaExceededError');
      }
      return originalSetItem.apply(this, args as [string, string]);
    });

    const { getByRole } = render(WorkoutDetail, { props: { date, workout: { ...workout, date }, onClose } });
    const markButton = getByRole('button', { name: 'Mark Complete' });
    await fireEvent.click(markButton);

    const retryButton = getByRole('button', { name: 'Retry' });
    retryButton.focus();
    await fireEvent.click(retryButton);

    expect(document.activeElement).not.toBe(document.body);
    expect(
      (document.activeElement as HTMLElement)?.classList.contains('button-primary') ||
        (document.activeElement as HTMLElement)?.classList.contains('back-button'),
    ).toBe(true);

    vi.restoreAllMocks();
  });

  it('Story 2.3 I/O matrix: the Edit trigger renders even on a rest day (no Workout, no LogEntry)', () => {
    const date = '2099-01-06';
    const onClose = vi.fn();
    const { getByRole, queryByRole } = render(WorkoutDetail, {
      props: { date, workout: undefined, onClose },
    });

    // A rest day has no Mark Complete button at all (scoped to !isRestDay),
    // but Edit must still be reachable -- it's the only way to log a
    // completely unplanned day from the UI (AD-8's orphaned-log case).
    expect(queryByRole('button', { name: 'Mark Complete' })).toBeNull();
    expect(getByRole('button', { name: 'Edit' })).toBeTruthy();
  });

  it('regression guard: logStore actually recorded the completion (sanity that the click path really wrote through)', async () => {
    const date = '2099-01-05';
    const onClose = vi.fn();
    const { getByRole } = render(WorkoutDetail, { props: { date, workout: { ...workout, date }, onClose } });
    await fireEvent.click(getByRole('button', { name: 'Mark Complete' }));

    expect(logStore.entries[date]?.completed).toBe(true);
  });

  it('Story 2.3: Edit -> fill a field -> Save writes through replaceLogEntry and returns to view mode', async () => {
    const date = '2099-01-08';
    const onClose = vi.fn();
    const { getByRole, getByLabelText } = render(WorkoutDetail, {
      props: { date, workout: { ...workout, date }, onClose },
    });

    await fireEvent.click(getByRole('button', { name: 'Edit' }));
    // WorkoutEditForm is now the panel's body -- fill a field and Save.
    await fireEvent.input(getByLabelText('Duration'), { target: { value: '45 min' } });
    await fireEvent.click(getByRole('button', { name: 'Save' }));

    expect(logStore.entries[date]?.duration).toBe('45 min');
    expect(logStore.entries[date]?.completed).toBe(true);

    // Back to view mode: the form is gone, the Edit trigger (and Mark
    // Complete/Incomplete) are back.
    expect(getByRole('button', { name: 'Edit' })).toBeTruthy();
    // Focus lands on Back, not the Edit trigger itself -- `celebrating`
    // (Completion Feedback, which fires unconditionally on every successful
    // Edit save) disables the Edit trigger via `disabled={celebrating}`, so
    // focusing it here would immediately drop focus to `document.body` the
    // instant it becomes disabled (the exact bug this test guards against;
    // mirrors Fix1's own `.back-button` assertion for the same hazard on
    // Mark Complete).
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toHaveClass('back-button');
  });

  it('Story 2.3: Edit -> fill a field -> Cancel discards the edit and returns to view mode with focus on Edit', async () => {
    const date = '2099-01-09';
    const onClose = vi.fn();
    const { getByRole, getByLabelText } = render(WorkoutDetail, {
      props: { date, workout: { ...workout, date }, onClose },
    });

    await fireEvent.click(getByRole('button', { name: 'Edit' }));
    await fireEvent.input(getByLabelText('Duration'), { target: { value: '45 min' } });
    await fireEvent.click(getByRole('button', { name: 'Cancel' }));

    expect(logStore.entries[date]).toBeUndefined();

    // Back to view mode, with focus restored to the Edit trigger that
    // opened it -- Cancel's own path never disables it the way a successful
    // Save's Completion Feedback does above.
    const editButton = getByRole('button', { name: 'Edit' });
    expect(editButton).toBeTruthy();
    expect(document.activeElement).toBe(editButton);
  });
});
