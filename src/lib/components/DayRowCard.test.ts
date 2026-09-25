// Story 2.4 -- Streak Tracking & Missed-Day Indication: regression coverage
// for DayRowCard's new Missed-state rendering and the Today-precedence-over-
// Missed rule (this story's Boundaries: "Today's own chip/label/tint...
// always takes precedence over Missed... a row never shows both").
//
// `getTodayIso` is mocked to a fixed date so "elapsed" (`date < todayIso`)
// is deterministic regardless of the real wall clock the test happens to run
// on -- `parseLocalDate`/every other export of `../domain/date` is passed
// through unmocked (this component still needs real weekday formatting).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { flushSync } from 'svelte';
import { render, cleanup } from '@testing-library/svelte';
import DayRowCard from './DayRowCard.svelte';
import { setCompleted } from '../data/logStore.svelte';
import type { Workout } from '../domain/parsePlan';

const FIXED_TODAY = '2026-09-25';

vi.mock('../domain/date', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../domain/date')>();
  return { ...actual, getTodayIso: () => FIXED_TODAY };
});

afterEach(() => {
  cleanup();
});

const scheduledPast: Workout = { date: '2026-09-20', type: 'Run', duration: '30 min' };

describe('DayRowCard Missed state (Story 2.4)', () => {
  it('a past scheduled day with no LogEntry renders the Missed chip, label, row tint, and exact meta copy', () => {
    const { container, getByText } = render(DayRowCard, {
      props: {
        date: scheduledPast.date,
        workout: scheduledPast,
        isToday: false,
        onOpen: vi.fn(),
      },
    });

    const row = container.querySelector('.day-row');
    expect(row).toHaveClass('missed');

    const chip = container.querySelector('.chip');
    expect(chip).toHaveClass('chip-missed');
    expect(chip).not.toHaveClass('chip-rest');
    expect(chip).not.toHaveClass('chip-upcoming');
    expect(chip).not.toHaveClass('chip-today');

    expect(getByText('Missed')).toBeTruthy();
    expect(getByText('missed — no log entry')).toBeTruthy();

    // Never color-only (Accessibility Floor): the accessible name itself
    // must also carry the Missed state -- via the frozen "missed — no log
    // entry" meta text folded into `statusText`, not a separate "Missed"
    // segment (fixed 2026-09-25: the aria-label used to say both, back to
    // back -- "..., Missed, ..., missed — no log entry" -- which this
    // assertion now guards against regressing).
    expect(row?.getAttribute('aria-label')).toContain('missed — no log entry');
    expect(row?.getAttribute('aria-label')).not.toMatch(/,\s*Missed,/);
  });

  it('a rest day (no Workout, no LogEntry) never renders as Missed, even though it is in the past', () => {
    const { container, queryByText } = render(DayRowCard, {
      props: {
        date: '2026-09-20',
        workout: undefined,
        isToday: false,
        onOpen: vi.fn(),
      },
    });

    const row = container.querySelector('.day-row');
    expect(row).not.toHaveClass('missed');
    expect(container.querySelector('.chip')).toHaveClass('chip-rest');
    expect(queryByText('Missed')).toBeNull();
  });

  it('a scheduled day that has not elapsed yet (today itself) is never Missed', () => {
    const { container, queryByText } = render(DayRowCard, {
      props: {
        date: FIXED_TODAY,
        workout: { date: FIXED_TODAY, type: 'Run', duration: '30 min' },
        isToday: true,
        onOpen: vi.fn(),
      },
    });

    const row = container.querySelector('.day-row');
    expect(row).toHaveClass('today');
    expect(row).not.toHaveClass('missed');
    expect(container.querySelector('.chip')).toHaveClass('chip-today');
    expect(queryByText('Missed')).toBeNull();
  });

  it("Today precedence: isToday always wins over Missed, even for a date that itself satisfies the elapsed test -- a row never shows both", () => {
    // Deliberately an inconsistent combination no real caller would ever
    // produce (App.svelte only ever passes isToday for date === todayIso) --
    // exercises the `!isToday` guard in `isMissed` directly, proving the
    // precedence rule is enforced by this component itself, not just an
    // accident of how it's normally called.
    const { container, getByText, queryByText } = render(DayRowCard, {
      props: {
        date: scheduledPast.date, // '2026-09-20', elapsed relative to FIXED_TODAY
        workout: scheduledPast,
        isToday: true,
        onOpen: vi.fn(),
      },
    });

    const row = container.querySelector('.day-row');
    expect(row).toHaveClass('today');
    expect(row).not.toHaveClass('missed');
    expect(container.querySelector('.chip')).toHaveClass('chip-today');
    expect(getByText('Today')).toBeTruthy();
    expect(queryByText('Missed')).toBeNull();
    expect(queryByText('missed — no log entry')).toBeNull();
  });

  it('a logged, non-Missed, non-Today scheduled day keeps the neutral chip-upcoming treatment (Always section, decided 2026-09-25)', () => {
    const loggedPast: Workout = { date: '2026-09-19', type: 'Run', duration: '30 min' };
    setCompleted(loggedPast.date, true, loggedPast);

    const { container, queryByText } = render(DayRowCard, {
      props: {
        date: loggedPast.date,
        workout: loggedPast,
        isToday: false,
        onOpen: vi.fn(),
      },
    });

    const chip = container.querySelector('.chip');
    expect(chip).toHaveClass('chip-upcoming');
    expect(chip).not.toHaveClass('chip-missed');
    expect(queryByText('Missed')).toBeNull();
  });

  it('live-update: a write elsewhere (setCompleted) flips this already-mounted row from Missed to logged, with no remount (AC5 / I/O matrix "live-update-on-save")', () => {
    // A distinct date from every other test in this file -- the Data Store
    // is a module-level singleton with no reset between tests, and other
    // tests in this file rely on this exact date having no LogEntry.
    const date = '2026-09-18';
    const workout: Workout = { date, type: 'Run', duration: '30 min' };

    const { container, queryByText } = render(DayRowCard, {
      props: { date, workout, isToday: false, onOpen: vi.fn() },
    });

    // Before any write: fully elapsed, no LogEntry -> Missed.
    expect(container.querySelector('.day-row')).toHaveClass('missed');
    expect(queryByText('Missed')).toBeTruthy();

    // Simulate a save completing elsewhere (Mark Complete/Edit inside
    // Workout Detail) writing through the same Data Store this component's
    // own `$derived(getLogEntry(date))` reads -- no new props, no remount,
    // just the reactive store reassignment `setCompleted`/`replaceLogEntry`
    // perform on success.
    flushSync(() => {
      setCompleted(date, true, workout);
    });

    // The SAME mounted instance reflects the write immediately -- this is
    // the actual mechanism AC5's "recomputes in the same moment as
    // Completion Feedback" depends on (Svelte's own reactivity, no explicit
    // event/callback wiring), not just "a freshly-rendered instance reads
    // current state."
    expect(container.querySelector('.day-row')).not.toHaveClass('missed');
    expect(container.querySelector('.chip')).toHaveClass('chip-upcoming');
    expect(queryByText('Missed')).toBeNull();
  });

  it("amended 2026-09-25 (intent_gap): a scheduled, elapsed day whose LogEntry is completed: false renders the full Missed treatment, same as a no-LogEntry day", () => {
    const incompletePast: Workout = { date: '2026-09-17', type: 'Run', duration: '30 min' };
    setCompleted(incompletePast.date, false, incompletePast);

    const { container, getByText } = render(DayRowCard, {
      props: {
        date: incompletePast.date,
        workout: incompletePast,
        isToday: false,
        onOpen: vi.fn(),
      },
    });

    const row = container.querySelector('.day-row');
    expect(row).toHaveClass('missed');

    const chip = container.querySelector('.chip');
    expect(chip).toHaveClass('chip-missed');
    expect(chip).not.toHaveClass('chip-rest');
    expect(chip).not.toHaveClass('chip-upcoming');
    expect(chip).not.toHaveClass('chip-today');

    expect(getByText('Missed')).toBeTruthy();
    expect(getByText('missed — no log entry')).toBeTruthy();
    expect(row?.getAttribute('aria-label')).toContain('missed — no log entry');
    expect(row?.getAttribute('aria-label')).not.toMatch(/,\s*Missed,/);
  });

  it('amended 2026-09-25 (intent_gap): an orphaned-log day (no Workout scheduled) marked completed: false is NOT shown as Missed -- nothing was scheduled to miss', () => {
    const orphanedIncompleteDate = '2026-09-16';
    setCompleted(orphanedIncompleteDate, false);

    const { container, queryByText } = render(DayRowCard, {
      props: {
        date: orphanedIncompleteDate,
        workout: undefined,
        isToday: false,
        onOpen: vi.fn(),
      },
    });

    const row = container.querySelector('.day-row');
    expect(row).not.toHaveClass('missed');
    expect(container.querySelector('.chip')).not.toHaveClass('chip-missed');
    expect(queryByText('Missed')).toBeNull();
    expect(queryByText('missed — no log entry')).toBeNull();
  });

  it('a future scheduled day (not yet elapsed, no LogEntry) is never Missed and keeps chip-upcoming', () => {
    const future: Workout = { date: '2099-01-01', type: 'Run', duration: '30 min' };
    const { container, queryByText } = render(DayRowCard, {
      props: {
        date: future.date,
        workout: future,
        isToday: false,
        onOpen: vi.fn(),
      },
    });

    const chip = container.querySelector('.chip');
    expect(chip).toHaveClass('chip-upcoming');
    expect(chip).not.toHaveClass('chip-missed');
    expect(queryByText('Missed')).toBeNull();
  });
});
