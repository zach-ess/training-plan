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
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
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

  it('regression guard: logStore actually recorded the completion (sanity that the click path really wrote through)', async () => {
    const date = '2099-01-05';
    const onClose = vi.fn();
    const { getByRole } = render(WorkoutDetail, { props: { date, workout: { ...workout, date }, onClose } });
    await fireEvent.click(getByRole('button', { name: 'Mark Complete' }));

    expect(logStore.entries[date]?.completed).toBe(true);
  });
});
