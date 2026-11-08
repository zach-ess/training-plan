// Story 5.1 -- WorkoutDetail's "Missed it" / "Undo missed" action: shown
// only for a planned day on or before today that isn't completed; writes
// through `setMissed`; shows the coach-voice confirmation (never Completion
// Feedback); is undone by "Undo missed", Mark Complete or Edit; and a failed
// write shows the shared error whose Retry repeats *this* action. "Today" is
// the adjustable `vi.hoisted` mock (CLAUDE.md: boundary days), and focus is
// checked with an inert/hidden-recording focus spy (CLAUDE.md: jsdom
// doesn't enforce `inert`).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import WorkoutDetail from './WorkoutDetail.svelte';
import { logStore, setCompleted, setMissed } from '../data/logStore.svelte';
import type { Workout } from '../domain/parsePlan';

const today = vi.hoisted(() => ({ iso: '2026-11-05' }));

vi.mock('../domain/date', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../domain/date')>();
  return { ...actual, getTodayIso: () => today.iso };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  today.iso = '2026-11-05';
  localStorage.clear();
  logStore.entries = {};
});

const CONFIRMATION = 'Logged as missed. No hiding from it — tomorrow you go again.';

const run = (date: string): Workout => ({ date, type: 'Run', duration: '30 min' });

function renderDetail(date: string, workout: Workout | undefined | null = run(date)) {
  return render(WorkoutDetail, { props: { date, workout: workout ?? undefined, onClose: vi.fn() } });
}

/** Mirrors App.test.ts's `trackFocusInert`: records every `.focus()` target
 * and whether it sat inside an inert or hidden subtree at that moment. */
function trackFocusInert() {
  const calls: { el: HTMLElement; inert: boolean; hidden: boolean }[] = [];
  const original = HTMLElement.prototype.focus;
  vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (this: HTMLElement, options?: FocusOptions) {
    let node: HTMLElement | null = this;
    let inert = false;
    let hidden = false;
    while (node) {
      if ((node as HTMLElement & { inert?: boolean }).inert === true) inert = true;
      if (node.hidden) hidden = true;
      node = node.parentElement;
    }
    calls.push({ el: this, inert, hidden });
    return original.call(this, options);
  });
  return calls;
}

function failNextWrites(count: number) {
  let remaining = count;
  const original = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, ...args) {
    if (remaining > 0) {
      remaining -= 1;
      throw new DOMException('quota exceeded (simulated)', 'QuotaExceededError');
    }
    return original.apply(this, args as [string, string]);
  });
}

describe('WorkoutDetail -- "Missed it" visibility (Story 5.1)', () => {
  const DAY = '2026-10-05';

  for (const [label, todayIso, visible] of [
    ['the day itself (today)', '2026-10-05', true],
    ['the day after', '2026-10-06', true],
    ['two days after', '2026-10-07', true],
    ['the day before (a future day)', '2026-10-04', false],
  ] as const) {
    it(`${label}: "Missed it" is ${visible ? 'shown' : 'absent'}`, () => {
      today.iso = todayIso;
      const { queryByRole } = renderDetail(DAY);
      expect(queryByRole('button', { name: 'Missed it' }) !== null).toBe(visible);
    });
  }

  it('absent on a rest day', () => {
    const { queryByRole } = renderDetail('2026-10-01', null);
    expect(queryByRole('button', { name: 'Missed it' })).toBeNull();
  });

  it('absent on an orphaned-log day (a log, nothing planned)', () => {
    const date = '2026-10-02';
    setCompleted(date, false);
    const { queryByRole } = renderDetail(date, null);
    expect(queryByRole('button', { name: 'Missed it' })).toBeNull();
    expect(queryByRole('button', { name: 'Undo missed' })).toBeNull();
  });

  it('absent on a completed day', () => {
    const date = '2026-10-03';
    setCompleted(date, true, run(date));
    const { queryByRole } = renderDetail(date);
    expect(queryByRole('button', { name: 'Missed it' })).toBeNull();
    expect(queryByRole('button', { name: 'Mark Incomplete' })).not.toBeNull();
  });

  it('a marked day offers "Undo missed", Mark Complete and Edit, and reads "Missed · noted"', () => {
    const date = '2026-10-06';
    setMissed(date, true);
    const { getByRole, getByText, queryByRole } = renderDetail(date);
    expect(getByRole('button', { name: 'Undo missed' })).toBeTruthy();
    expect(queryByRole('button', { name: 'Missed it' })).toBeNull();
    expect(getByRole('button', { name: 'Mark Complete' })).toBeTruthy();
    expect(getByRole('button', { name: 'Edit' })).toBeTruthy();
    expect(getByText('Missed · noted')).toBeTruthy();
  });

  it('a marked-missed planned Run day keeps the "Run" title', () => {
    const date = '2026-10-07';
    setMissed(date, true);
    const { getByRole } = renderDetail(date);
    expect(getByRole('heading', { level: 2 })).toHaveTextContent('Run');
  });

  it('an orphaned-log day still marked missed (with data) offers "Undo missed", which removes only the flag', async () => {
    const date = '2026-10-08';
    setCompleted(date, false, run(date));
    setMissed(date, true);
    const { getByRole, queryByRole } = renderDetail(date, null);

    expect(queryByRole('button', { name: 'Missed it' })).toBeNull();
    await fireEvent.click(getByRole('button', { name: 'Undo missed' }));

    expect(logStore.entries[date]).toEqual({ date, completed: false, type: 'Run', duration: '30 min', schemaVersion: 1 });
    expect(queryByRole('button', { name: /missed/i })).toBeNull();
  });
});

describe('WorkoutDetail -- marking and undoing (Story 5.1)', () => {
  it('a past unchecked day: writes { completed: false, missed: true }, confirms in coach voice, no celebration, focus stays on the swapped button', async () => {
    const date = '2026-10-20';
    const { getByRole, getByText, container } = renderDetail(date);
    const button = getByRole('button', { name: 'Missed it' });
    button.focus();
    const focusCalls = trackFocusInert();

    await fireEvent.click(button);

    expect(logStore.entries[date]).toEqual({ date, completed: false, missed: true, schemaVersion: 1 });
    const undo = getByRole('button', { name: 'Undo missed' });
    expect(document.activeElement).toBe(undo);
    // Same element, label swapped: focus never had to move at all.
    expect(focusCalls).toHaveLength(0);
    expect(getByRole('status')).toHaveTextContent(CONFIRMATION);
    expect(getByText('Missed · noted')).toBeTruthy();
    expect(container.querySelector('.celebration')).toBeNull();
  });

  it('today: same write and confirmation', async () => {
    const date = '2026-11-05';
    const { getByRole } = renderDetail(date);
    await fireEvent.click(getByRole('button', { name: 'Missed it' }));
    expect(logStore.entries[date]).toEqual({ date, completed: false, missed: true, schemaVersion: 1 });
    expect(getByRole('status')).toHaveTextContent(CONFIRMATION);
  });

  it('a Mark-Incomplete entry keeps its type/duration when marked missed', async () => {
    const date = '2026-10-21';
    setCompleted(date, false, run(date));
    const { getByRole } = renderDetail(date);
    await fireEvent.click(getByRole('button', { name: 'Missed it' }));
    expect(logStore.entries[date]).toEqual({ date, completed: false, missed: true, type: 'Run', duration: '30 min', schemaVersion: 1 });
  });

  it('Undo on a bare missed entry removes it; the confirmation clears; focus stays on the button', async () => {
    const date = '2026-10-22';
    const { getByRole } = renderDetail(date);
    await fireEvent.click(getByRole('button', { name: 'Missed it' }));
    const undo = getByRole('button', { name: 'Undo missed' });
    undo.focus();

    await fireEvent.click(undo);

    expect(date in logStore.entries).toBe(false);
    expect(document.activeElement).toBe(getByRole('button', { name: 'Missed it' }));
    expect(getByRole('status')).toHaveTextContent('');
  });

  it('Undo on a missed entry with data keeps the data', async () => {
    const date = '2026-10-23';
    setCompleted(date, false, run(date));
    setMissed(date, true);
    const { getByRole } = renderDetail(date);
    await fireEvent.click(getByRole('button', { name: 'Undo missed' }));
    expect(logStore.entries[date]).toEqual({ date, completed: false, type: 'Run', duration: '30 min', schemaVersion: 1 });
  });

  it('Mark Complete on a missed day: completed, missed gone, Completion Feedback fires', async () => {
    const date = '2026-10-24';
    setMissed(date, true);
    const { getByRole, queryByRole, container } = renderDetail(date);

    await fireEvent.click(getByRole('button', { name: 'Mark Complete' }));

    expect(logStore.entries[date]?.completed).toBe(true);
    expect(logStore.entries[date]).not.toHaveProperty('missed');
    expect(container.querySelector('.celebration')).not.toBeNull();
    expect(queryByRole('button', { name: /missed/i })).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
  });

  it('Edit save on a missed day: completed, missed gone, Completion Feedback fires', async () => {
    const date = '2026-10-25';
    setMissed(date, true);
    const { getByRole, getByLabelText, container } = renderDetail(date);

    await fireEvent.click(getByRole('button', { name: 'Edit' }));
    await fireEvent.input(getByLabelText('Duration'), { target: { value: '20 min' } });
    await fireEvent.click(getByRole('button', { name: 'Save' }));

    expect(logStore.entries[date]?.completed).toBe(true);
    expect(logStore.entries[date]).not.toHaveProperty('missed');
    expect(container.querySelector('.celebration')).not.toBeNull();
  });
});

describe('WorkoutDetail -- "Missed it" write failure (Story 5.1, AD-4)', () => {
  it('shows the plain-voice error + Retry, changes nothing, and Retry repeats the missed write (not Mark Complete)', async () => {
    const date = '2026-10-26';
    failNextWrites(1);
    const { getByRole, queryByRole, container } = renderDetail(date);

    await fireEvent.click(getByRole('button', { name: 'Missed it' }));

    expect(getByRole('alert')).toHaveTextContent("Couldn't save — your device storage is full.");
    expect(date in logStore.entries).toBe(false);
    expect(getByRole('button', { name: 'Missed it' })).toBeTruthy();
    expect(getByRole('status')).toHaveTextContent('');

    const retry = getByRole('button', { name: 'Retry' });
    retry.focus();
    const focusCalls = trackFocusInert();
    await fireEvent.click(retry);

    expect(logStore.entries[date]).toEqual({ date, completed: false, missed: true, schemaVersion: 1 });
    expect(queryByRole('alert')).toBeNull();
    expect(container.querySelector('.celebration')).toBeNull();
    expect(document.activeElement).toBe(getByRole('button', { name: 'Undo missed' }));
    expect(focusCalls.length).toBeGreaterThanOrEqual(1);
    expect(focusCalls.every(({ inert, hidden }) => !inert && !hidden)).toBe(true);
  });

  it('a failed Undo leaves the day marked', async () => {
    const date = '2026-10-27';
    setMissed(date, true);
    failNextWrites(1);
    const { getByRole } = renderDetail(date);

    await fireEvent.click(getByRole('button', { name: 'Undo missed' }));

    expect(getByRole('alert')).toBeTruthy();
    expect(logStore.entries[date]).toEqual({ date, completed: false, missed: true, schemaVersion: 1 });
    expect(getByRole('button', { name: 'Undo missed' })).toBeTruthy();
  });

  it('after a failed Mark Complete, Retry still repeats Mark Complete', async () => {
    const date = '2026-10-28';
    failNextWrites(1);
    const { getByRole } = renderDetail(date);

    await fireEvent.click(getByRole('button', { name: 'Mark Complete' }));
    await fireEvent.click(getByRole('button', { name: 'Retry' }));

    expect(logStore.entries[date]?.completed).toBe(true);
    expect(logStore.entries[date]).not.toHaveProperty('missed');
  });

  it('after a failed "Missed it", tapping Mark Complete (not Retry) marks the day complete', async () => {
    const date = '2026-10-29';
    failNextWrites(1);
    const { getByRole, queryByRole } = renderDetail(date);

    await fireEvent.click(getByRole('button', { name: 'Missed it' }));
    expect(getByRole('alert')).toBeTruthy();
    await fireEvent.click(getByRole('button', { name: 'Mark Complete' }));

    expect(logStore.entries[date]?.completed).toBe(true);
    expect(logStore.entries[date]).not.toHaveProperty('missed');
    expect(queryByRole('alert')).toBeNull();
  });
});
