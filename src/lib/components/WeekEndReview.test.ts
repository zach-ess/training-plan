// Story 3.3 -- Week-End Review: regression coverage for every I/O matrix row.
// Mirrors `HistoryView.test.ts`'s own conventions: `getTodayIso` is mocked to
// a fixed date (chosen after every test week below so elapsed-day
// arithmetic -- computeStreak/computeMissedCount -- is deterministic),
// `planStore`/`logStore`/`weekEndReviewStore` are the real module-level
// singletons with no reset between tests, so each test uses its own Sunday
// week (`WEEK_1`..`WEEK_6` below) to stay independent, mirroring
// `DayRowCard.test.ts`'s/`HistoryView.test.ts`'s own "each test uses its own
// date" convention.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { flushSync } from 'svelte';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import WeekEndReview from './WeekEndReview.svelte';
import { planStore } from '../data/planStore.svelte';
import { setCompleted } from '../data/logStore.svelte';
import { getReview, weekEndReviewStore } from '../data/weekEndReviewStore.svelte';
import { getWeekDates, parseLocalDate, toLocalIsoDate } from '../domain/date';
import type { Workout } from '../domain/parsePlan';

/** Epic 3 retro fix (F1, 2026-09-26): the 7 dates in the reviewed window
 * ending on (and including) `weekEndIso` -- mirrors WeekEndReview.svelte's
 * own corrected windowing (Sunday is the LAST day of the reviewed week, per
 * Zach's own convention, not the first). Fixture dates below must land
 * inside this backward-looking window, not `getWeekDates(weekEndIso)`'s
 * forward one. */
function reviewWindowDates(weekEndIso: string): string[] {
  const end = parseLocalDate(weekEndIso);
  const start = toLocalIsoDate(new Date(end.getFullYear(), end.getMonth(), end.getDate() - 6));
  return getWeekDates(start);
}

// Six real, consecutive Sundays -- one per test that needs its own isolated
// week, well before FIXED_TODAY so every date in every one of these weeks
// has fully elapsed.
const WEEK_1 = '2027-03-07';
const WEEK_2 = '2027-03-14';
const WEEK_3 = '2027-03-21';
const WEEK_4 = '2027-03-28';
const WEEK_5 = '2027-04-04';
const WEEK_6 = '2027-04-11';
const FIXED_TODAY = '2027-04-20';

// Story 4.3 -- adjustable per test (reset after each) so a review can be
// rendered on its own Sunday as well as late.
const today = vi.hoisted(() => ({ iso: '2027-04-20' }));

vi.mock('../domain/date', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../domain/date')>();
  return { ...actual, getTodayIso: () => today.iso };
});

afterEach(() => {
  cleanup();
  today.iso = FIXED_TODAY;
});

function setLoadedPlan(workouts: Workout[]) {
  planStore.plan = { workouts };
  planStore.status = 'loaded';
}

function cellValue(container: HTMLElement, label: string): string | undefined {
  const cells = Array.from(container.querySelectorAll('.rollup-cell'));
  const cell = cells.find((el) => el.querySelector('.rollup-cell-label')?.textContent === label);
  return cell?.querySelector('.rollup-cell-value')?.textContent ?? undefined;
}

function byTypeValue(container: HTMLElement, type: string): string | undefined {
  const items = Array.from(container.querySelectorAll('.rollup-bytype-item'));
  const item = items.find((el) => el.querySelector('.rollup-type-label')?.textContent === type);
  return item?.querySelector('.rollup-cell-value')?.textContent ?? undefined;
}

describe('WeekEndReview -- I/O matrix (editable/unsaved mode)', () => {
  it('Zero Log Entries this week: rollup-grid renders honest zeros, not hidden, and the reflection field is a real editable textarea', () => {
    setLoadedPlan([]);

    const { container, getByLabelText } = render(WeekEndReview, {
      props: { weekStartIso: WEEK_1, readOnly: false, onClose: vi.fn() },
    });

    expect(cellValue(container, 'Workouts completed')).toBe('0');
    expect(cellValue(container, 'Days missed')).toBe('0');
    expect(byTypeValue(container, 'Run')).toBe('0');
    expect(byTypeValue(container, 'Unspecified')).toBe('0');

    const textarea = getByLabelText('Reflection') as HTMLTextAreaElement;
    expect(textarea.tagName).toBe('TEXTAREA');
    expect(textarea.disabled).toBe(false);
  });

  it("Banner-opened dialog: rollup-grid is pre-populated live from that week's Log Entries, nothing to re-enter", () => {
    const [, , runDate, bikeDate] = reviewWindowDates(WEEK_2); // two days inside the window ending on WEEK_2
    const runWorkout: Workout = { date: runDate, type: 'Run', duration: '30 min' };
    const bikeWorkout: Workout = { date: bikeDate, type: 'Bike', duration: '45 min' };
    setCompleted(runDate, true, runWorkout);
    setCompleted(bikeDate, true, bikeWorkout);
    setLoadedPlan([runWorkout, bikeWorkout]);

    const { container } = render(WeekEndReview, {
      props: { weekStartIso: WEEK_2, readOnly: false, onClose: vi.fn() },
    });

    expect(cellValue(container, 'Workouts completed')).toBe('2');
    expect(byTypeValue(container, 'Run')).toBe('1');
    expect(byTypeValue(container, 'Bike')).toBe('1');
  });

  it('Epic 3 retro regression (F1): the reviewed window ends on weekStartIso (inclusive) and runs backward 6 days -- a workout logged ON that Sunday counts, one logged the day after does not', () => {
    const weekEndIso = '2026-11-15'; // its own isolated Sunday, well clear of every other test's window in this file
    const onTheSunday: Workout = { date: weekEndIso, type: 'Run', duration: '20 min' };
    // The day *after* weekStartIso -- inside the old (buggy) forward-looking
    // window this story originally shipped with, and must NOT be counted
    // under the corrected backward-looking window.
    const dayAfter = '2026-11-16';
    const afterWorkout: Workout = { date: dayAfter, type: 'Bike', duration: '20 min' };
    setCompleted(weekEndIso, true, onTheSunday);
    setCompleted(dayAfter, true, afterWorkout);
    setLoadedPlan([onTheSunday, afterWorkout]);

    const { container } = render(WeekEndReview, {
      props: { weekStartIso: weekEndIso, readOnly: false, onClose: vi.fn() },
    });

    expect(cellValue(container, 'Workouts completed')).toBe('1');
    expect(byTypeValue(container, 'Run')).toBe('1');
    expect(byTypeValue(container, 'Bike')).toBe('0');
  });

  it('rollup-grid numbers render as .rollup-cell-value elements (AC3 -- the static token-wiring check in scripts/verify-color-tokens.mjs confirms these route through --type-rollup-readout-*)', () => {
    setLoadedPlan([]);
    const { container } = render(WeekEndReview, {
      props: { weekStartIso: WEEK_3, readOnly: false, onClose: vi.fn() },
    });

    // jsdom's getComputedStyle doesn't resolve CSS custom properties
    // (var(--...)), so the actual --type-rollup-readout-* token wiring is
    // asserted statically instead (checkWeekEndReviewWiring in
    // scripts/verify-color-tokens.mjs) -- this just confirms the readout
    // elements this app's design actually renders exist at all.
    expect(container.querySelectorAll('.rollup-cell-value').length).toBeGreaterThan(0);
  });

  it('Log another day, reopen before Save: the grid recomputes live in the same mounted instance', () => {
    const [, , firstDate, secondDate] = reviewWindowDates(WEEK_4); // two days inside the window ending on WEEK_4
    const firstWorkout: Workout = { date: firstDate, type: 'Run', duration: '20 min' };
    setCompleted(firstDate, true, firstWorkout);
    setLoadedPlan([firstWorkout]);

    const { container } = render(WeekEndReview, {
      props: { weekStartIso: WEEK_4, readOnly: false, onClose: vi.fn() },
    });

    expect(cellValue(container, 'Workouts completed')).toBe('1');

    flushSync(() => {
      setCompleted(secondDate, true, { date: secondDate, type: 'Lift', duration: '15 min' });
    });

    expect(cellValue(container, 'Workouts completed')).toBe('2');
    expect(byTypeValue(container, 'Lift')).toBe('1');
  });

  it('Save tapped: numbers and reflection save together in one action, and a successful Save closes the dialog', async () => {
    const [, , date] = reviewWindowDates(WEEK_5); // a day inside the window ending on WEEK_5
    const workout: Workout = { date, type: 'Run', duration: '30 min' };
    setCompleted(date, true, workout);
    setLoadedPlan([workout]);
    const onClose = vi.fn();

    const { getByLabelText, getByRole } = render(WeekEndReview, {
      props: { weekStartIso: WEEK_5, readOnly: false, onClose },
    });

    await fireEvent.input(getByLabelText('Reflection'), { target: { value: 'Felt strong this week.' } });
    await fireEvent.click(getByRole('button', { name: 'Save' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    const saved = getReview(WEEK_5);
    expect(saved?.workoutsCompleted).toBe(1);
    expect(saved?.byType.Run).toBe(1);
    expect(saved?.reflection).toBe('Felt strong this week.');
  });

  it('a failed Save shows the write-error/Retry UI, and never closes the dialog', async () => {
    setLoadedPlan([]);
    const onClose = vi.fn();
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded (simulated)', 'QuotaExceededError');
    });

    const { getByRole } = render(WeekEndReview, {
      props: { weekStartIso: WEEK_6, readOnly: false, onClose },
    });

    await fireEvent.click(getByRole('button', { name: 'Save' }));

    expect(getByRole('alert')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();

    spy.mockRestore();
    await fireEvent.click(getByRole('button', { name: 'Retry' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(getReview(WEEK_6)).toBeDefined();
  });

  it('Escape closes the dialog', async () => {
    setLoadedPlan([]);
    const onClose = vi.fn();
    render(WeekEndReview, {
      props: { weekStartIso: '2027-04-18', readOnly: false, onClose },
    });

    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Back closes the dialog', async () => {
    setLoadedPlan([]);
    const onClose = vi.fn();
    const { getByRole } = render(WeekEndReview, {
      props: { weekStartIso: '2027-04-25', readOnly: false, onClose },
    });

    await fireEvent.click(getByRole('button', { name: '← Back' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('WeekEndReview -- I/O matrix (read-only, reopening a saved week)', () => {
  it("Reopen a saved week: renders the frozen snapshot verbatim, never recomputed even after that week's Log Entries are later edited", async () => {
    const week = '2027-02-07'; // its own week, unused elsewhere in this file
    const [, , date] = reviewWindowDates(week);
    const workout: Workout = { date, type: 'Run', duration: '30 min' };
    setCompleted(date, true, workout);
    setLoadedPlan([workout]);

    const onClose = vi.fn();
    const { getByLabelText, getByRole, unmount } = render(WeekEndReview, {
      props: { weekStartIso: week, readOnly: false, onClose },
    });
    await fireEvent.input(getByLabelText('Reflection'), { target: { value: 'Great week.' } });
    await fireEvent.click(getByRole('button', { name: 'Save' }));
    unmount();

    // Edit that week's Log Entry *after* saving -- this must never change
    // what the saved Review shows (this story's I/O matrix / Never section).
    setCompleted(date, false);

    // Confirm the mutation really did change what a *live* recompute would
    // now show, so the read-only assertion below is a genuine freeze check,
    // not a coincidence.
    const { container: liveContainer, unmount: unmountLive } = render(WeekEndReview, {
      props: { weekStartIso: week, readOnly: false, onClose: vi.fn() },
    });
    expect(cellValue(liveContainer, 'Workouts completed')).toBe('0');
    unmountLive();

    const { container, queryByRole, getByText } = render(WeekEndReview, {
      props: { weekStartIso: week, readOnly: true, onClose: vi.fn() },
    });

    expect(cellValue(container, 'Workouts completed')).toBe('1');
    expect(byTypeValue(container, 'Run')).toBe('1');
    expect(getByText('Great week.')).toBeTruthy();
    // Never editable, never a Save trigger, once saved (this story's Never
    // section).
    expect(queryByRole('textbox')).toBeNull();
    expect(queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('read-only mode has no Save button and no write-error UI, only Back', () => {
    const week = '2027-01-03';
    const [, , date] = reviewWindowDates(week);
    setCompleted(date, true, { date, type: 'Run', duration: '30 min' });
    weekEndReviewStore.reviews[week] = {
      weekStartIso: week,
      workoutsCompleted: 1,
      byType: { Run: 1, Bike: 0, Lift: 0, Mobility: 0, Stretch: 0, Other: 0, Unspecified: 0 },
      streak: 1,
      missedCount: 0,
      reflection: 'Solid.',
      schemaVersion: 1,
    };

    const { queryByRole, getByRole } = render(WeekEndReview, {
      props: { weekStartIso: week, readOnly: true, onClose: vi.fn() },
    });

    expect(queryByRole('button', { name: 'Save' })).toBeNull();
    expect(queryByRole('alert')).toBeNull();
    expect(getByRole('button', { name: '← Back' })).toBeTruthy();
  });
});

// Story 4.3 -- a late Review (its Sunday already past) evaluates Streak and
// Days missed as of the end of that Sunday, not today (AD-2, late reviews).
// Fixture: Sunday 2027-02-28 reviewed on FIXED_TODAY (2027-04-20). A missed
// workout AFTER that Sunday (Tue 03-02) breaks today's streak to 0, while the
// streak at the end of that Sunday was 2 (Fri 02-26 + Sun 02-28; Tue 02-23 was
// missed, which also makes Days missed = 1 for that week).
describe('WeekEndReview -- late review numbers (Story 4.3)', () => {
  const SUNDAY = '2027-02-28';
  const plan: Workout[] = [
    { date: '2027-02-23', type: 'Run', duration: '30 min' },
    { date: '2027-02-26', type: 'Run', duration: '30 min' },
    { date: SUNDAY, type: 'Run', duration: '60 min' },
    { date: '2027-03-02', type: 'Run', duration: '30 min' },
  ];

  it('shows the Streak and Days missed as of the end of that Sunday, and saves those numbers', async () => {
    setLoadedPlan(plan);
    setCompleted('2027-02-26', true, plan[1]);
    setCompleted(SUNDAY, true, plan[2]);

    const { container, getByRole } = render(WeekEndReview, {
      props: { weekStartIso: SUNDAY, readOnly: false, onClose: vi.fn() },
    });

    expect(cellValue(container, 'Streak')).toBe('2');
    expect(cellValue(container, 'Days missed')).toBe('1');
    expect(cellValue(container, 'Workouts completed')).toBe('2');

    await fireEvent.click(getByRole('button', { name: 'Save' }));
    expect(getReview(SUNDAY)).toMatchObject({ streak: 2, missedCount: 1, workoutsCompleted: 2 });
  });
});

describe('WeekEndReview -- Streak/Days missed edges (Story 4.3 review)', () => {
  it('on the Sunday itself, its not-yet-logged workout neither counts as missed nor breaks the Streak', () => {
    const sunday = '2027-01-31';
    today.iso = sunday;
    const plan: Workout[] = [
      { date: '2027-01-29', type: 'Run', duration: '30 min' },
      { date: sunday, type: 'Run', duration: '60 min' },
    ];
    setLoadedPlan(plan);
    setCompleted('2027-01-29', true, plan[0]);

    const { container } = render(WeekEndReview, { props: { weekStartIso: sunday, readOnly: false, onClose: vi.fn() } });

    expect(cellValue(container, 'Days missed')).toBe('0');
    expect(cellValue(container, 'Streak')).toBe('1');
  });

  it('a late review of a missed Sunday: Streak 0 and the Sunday counts as missed, even with a Monday workout logged afterward', () => {
    const sunday = '2027-01-24';
    const plan: Workout[] = [
      { date: '2027-01-22', type: 'Run', duration: '30 min' },
      { date: sunday, type: 'Run', duration: '60 min' },
      { date: '2027-01-25', type: 'Lift', duration: '40 min' },
    ];
    setLoadedPlan(plan);
    setCompleted('2027-01-22', true, plan[0]);
    setCompleted('2027-01-25', true, plan[2]); // the Monday after: must not count

    const { container } = render(WeekEndReview, { props: { weekStartIso: sunday, readOnly: false, onClose: vi.fn() } });

    expect(cellValue(container, 'Streak')).toBe('0');
    expect(cellValue(container, 'Days missed')).toBe('1');
  });

  it('a late review of a completed Sunday is not raised by a Monday workout logged afterward', () => {
    const sunday = '2027-01-17';
    const plan: Workout[] = [
      { date: sunday, type: 'Run', duration: '60 min' },
      { date: '2027-01-18', type: 'Lift', duration: '40 min' },
    ];
    setLoadedPlan(plan);
    setCompleted(sunday, true, plan[0]);
    setCompleted('2027-01-18', true, plan[1]);

    const { container } = render(WeekEndReview, { props: { weekStartIso: sunday, readOnly: false, onClose: vi.fn() } });

    expect(cellValue(container, 'Streak')).toBe('1');
  });
});

// Epic 4 retro, F1: the boundary day -- a late review opened on the Monday
// right after its Sunday (asOfIso is that Monday AND today). The Monday's
// LogEntry must still not count toward the "as of that Sunday" Streak.
describe('WeekEndReview -- late review opened on the following Monday (Epic 4 retro F1)', () => {
  // Both fixtures' weeks and Mondays sit outside every other test's 7-day
  // review window in this file, since the log store is shared across it.
  it('missed Sunday + Monday logged: Streak 0, Sunday counted as missed, and that is what Save freezes', async () => {
    const sunday = '2026-11-29';
    const monday = '2026-11-30';
    today.iso = monday;
    const plan: Workout[] = [
      { date: '2026-11-27', type: 'Run', duration: '30 min' },
      { date: sunday, type: 'Run', duration: '60 min' },
      { date: monday, type: 'Lift', duration: '40 min' },
    ];
    setLoadedPlan(plan);
    setCompleted('2026-11-27', true, plan[0]);
    setCompleted(monday, true, plan[2]);

    const { container, getByRole } = render(WeekEndReview, {
      props: { weekStartIso: sunday, readOnly: false, onClose: vi.fn() },
    });

    expect(cellValue(container, 'Streak')).toBe('0');
    expect(cellValue(container, 'Days missed')).toBe('1');
    // The Monday's Lift falls after the Mon-Sun week, so it isn't in the rollup.
    expect(cellValue(container, 'Workouts completed')).toBe('1');

    await fireEvent.click(getByRole('button', { name: 'Save' }));
    expect(getReview(sunday)).toMatchObject({ streak: 0, missedCount: 1, workoutsCompleted: 1 });
  });

  it('completed Sunday + Monday logged: the Monday does not raise the Streak', () => {
    const sunday = '2026-11-01';
    const monday = '2026-11-02';
    today.iso = monday;
    const plan: Workout[] = [
      { date: sunday, type: 'Run', duration: '60 min' },
      { date: monday, type: 'Lift', duration: '40 min' },
    ];
    setLoadedPlan(plan);
    setCompleted(sunday, true, plan[0]);
    setCompleted(monday, true, plan[1]);

    const { container } = render(WeekEndReview, { props: { weekStartIso: sunday, readOnly: false, onClose: vi.fn() } });

    expect(cellValue(container, 'Streak')).toBe('1');
    expect(cellValue(container, 'Days missed')).toBe('0');
    expect(cellValue(container, 'Workouts completed')).toBe('1');
  });
});
