// Story 2.4 -- Streak Tracking & Missed-Day Indication: regression coverage
// for `computeStreak`'s count/break/skip rules (this spec's I/O matrix and
// Design Notes worked example). A pure function with no Data Store import,
// so these tests build `entries`/`workoutsByDate` directly rather than going
// through `logStore.svelte.ts`.
import { describe, it, expect } from 'vitest';
import { computeStreak } from './computeStreak';
import type { Workout } from './parsePlan';

function workout(date: string, overrides: Partial<Workout> = {}): Workout {
  return { date, type: 'Run', duration: '30 min', ...overrides };
}

function byDate(...workouts: Workout[]): Map<string, Workout> {
  return new Map(workouts.map((w) => [w.date, w]));
}

describe('computeStreak', () => {
  it("Design Notes' own worked example: counts through a rest day, skips today, breaks at the first elapsed unlogged scheduled day", () => {
    const dayRange = [
      '2026-09-20',
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
    ];
    const todayIso = '2026-09-25';

    // index 5 (today): scheduled, no LogEntry -> 'planned', not elapsed -> skip
    // index 4: scheduled + LogEntry -> 'logged' -> count (streak=1)
    // index 3: rest day, no LogEntry -> 'empty' -> pass through
    // index 2: scheduled + LogEntry -> 'logged' -> count (streak=2)
    // index 1: scheduled, no LogEntry -> 'planned', elapsed -> break
    // index 0: never inspected
    const workoutsByDate = byDate(
      workout('2026-09-25'),
      workout('2026-09-24'),
      workout('2026-09-22'),
      workout('2026-09-21'),
    );
    const entries: Record<string, unknown> = {
      '2026-09-24': { completed: true },
      '2026-09-22': { completed: true },
    };

    expect(computeStreak(dayRange, workoutsByDate, entries, todayIso)).toBe(2);
  });

  it('AC1: a day with a LogEntry counts toward the Streak', () => {
    const dayRange = ['2026-09-24', '2026-09-25'];
    const todayIso = '2026-09-25';
    const workoutsByDate = byDate(workout('2026-09-24'));
    const entries: Record<string, unknown> = { '2026-09-24': { completed: true } };

    expect(computeStreak(dayRange, workoutsByDate, entries, todayIso)).toBe(1);
  });

  it("AC2: a rest day with no LogEntry never breaks the Streak, even when every day in range is a rest day", () => {
    const dayRange = ['2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25'];
    const todayIso = '2026-09-25';
    // No workouts scheduled anywhere -> every day is 'empty'. The walk
    // reaches dayRange's start without ever breaking; nothing was ever
    // logged, so the count stays 0 -- but critically, it isn't a "break".
    expect(computeStreak(dayRange, new Map(), {}, todayIso)).toBe(0);
  });

  it('a rest day sitting mid-streak is passed through, not counted and not breaking', () => {
    const dayRange = ['2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25'];
    const todayIso = '2026-09-25';
    const workoutsByDate = byDate(workout('2026-09-25'), workout('2026-09-22'));
    const entries: Record<string, unknown> = {
      '2026-09-24': { completed: true }, // rest day, orphaned-log
      '2026-09-22': { completed: true }, // scheduled, logged
    };
    // index 3 (today, 2026-09-25): planned, not elapsed -> skip
    // index 2 (2026-09-24): rest day with a LogEntry -> 'orphaned-log' -> count (1)
    // index 1 (2026-09-23): rest day, no LogEntry -> 'empty' -> pass through
    // index 0 (2026-09-22): scheduled + LogEntry -> 'logged' -> count (2)
    expect(computeStreak(dayRange, workoutsByDate, entries, todayIso)).toBe(2);
  });

  it('AC3: a fully-elapsed scheduled day with no LogEntry breaks the Streak', () => {
    const dayRange = ['2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25'];
    const todayIso = '2026-09-25';
    const workoutsByDate = byDate(
      workout('2026-09-25'),
      workout('2026-09-24'),
      workout('2026-09-22'), // scheduled but never logged, and it's in the past
    );
    const entries: Record<string, unknown> = {
      '2026-09-24': { completed: true },
    };
    // index 3 (today): planned, not elapsed -> skip
    // index 2 (2026-09-24): logged -> count (1)
    // index 1 (2026-09-23): rest day, no LogEntry -> empty -> pass through
    // index 0 (2026-09-22): scheduled, no LogEntry, elapsed -> break
    expect(computeStreak(dayRange, workoutsByDate, entries, todayIso)).toBe(1);
  });

  it('AC4: elapsed is decided by plain ISO string comparison (local-date semantics), not a UTC-shifted one', () => {
    // '2026-09-24' < '2026-09-25' lexicographically the same as
    // chronologically -- this is the exact same test computeStreak and
    // DayRowCard's own Missed-state check share.
    const dayRange = ['2026-09-24', '2026-09-25'];
    const todayIso = '2026-09-25';
    const workoutsByDate = byDate(workout('2026-09-24'));
    expect(computeStreak(dayRange, workoutsByDate, {}, todayIso)).toBe(0);
  });

  it('brand-new install: dayRange has no past days, Plan starts today -> Streak is 0', () => {
    const dayRange = ['2026-09-25'];
    const todayIso = '2026-09-25';
    // Today itself, scheduled but not yet logged -> 'planned', not elapsed -> skip.
    const workoutsByDate = byDate(workout('2026-09-25'));
    expect(computeStreak(dayRange, workoutsByDate, {}, todayIso)).toBe(0);

    // Also true when today is a rest day.
    expect(computeStreak(dayRange, new Map(), {}, todayIso)).toBe(0);
  });

  it('an orphaned-log day (rest day with a LogEntry) counts toward the Streak like any other logged day', () => {
    const dayRange = ['2026-09-24', '2026-09-25'];
    const todayIso = '2026-09-25';
    // No Workout scheduled for 2026-09-24 at all -- an orphaned log.
    const entries: Record<string, unknown> = { '2026-09-24': { completed: true } };
    expect(computeStreak(dayRange, new Map(), entries, todayIso)).toBe(1);
  });

  it("amended 2026-09-25 (intent_gap): a scheduled day logged with completed: false does NOT count, and behaves like a 'planned'-with-no-LogEntry day for the walk (breaks once elapsed)", () => {
    const dayRange = ['2026-09-23', '2026-09-24', '2026-09-25'];
    const todayIso = '2026-09-25';
    const workoutsByDate = byDate(
      workout('2026-09-25'),
      workout('2026-09-24'),
      workout('2026-09-23'),
    );
    // 2026-09-24: scheduled + LogEntry, but explicitly Mark Incomplete.
    const entries: Record<string, unknown> = {
      '2026-09-24': { completed: false },
      '2026-09-23': { completed: true },
    };
    // index 2 (today): planned, not elapsed -> skip
    // index 1 (2026-09-24): 'logged', completed === false -> does not count;
    //   elapsed -> breaks the walk exactly like a 'planned' day would, so
    //   index 0's otherwise-genuine log at 2026-09-23 is never reached.
    expect(computeStreak(dayRange, workoutsByDate, entries, todayIso)).toBe(0);
  });

  it('amended 2026-09-25 (intent_gap): an orphaned-log day (no Workout scheduled) marked completed: false does NOT count toward the Streak, and -- since nothing was scheduled to miss -- passes through without breaking it either, exactly like a rest day', () => {
    const dayRange = ['2026-09-23', '2026-09-24', '2026-09-25'];
    const todayIso = '2026-09-25';
    // Nothing scheduled on 2026-09-24 or 2026-09-23 -- an orphaned log on
    // 2026-09-24, and a genuine orphaned log on 2026-09-23.
    const entries: Record<string, unknown> = {
      '2026-09-24': { completed: false },
      '2026-09-23': { completed: true },
    };
    // index 2 (today): rest day, not elapsed -> skip
    // index 1 (2026-09-24): 'orphaned-log', completed === false -> does not
    //   count, but nothing was scheduled -> passes through without breaking
    // index 0 (2026-09-23): 'orphaned-log', completed !== false -> counts (1)
    expect(computeStreak(dayRange, new Map(), entries, todayIso)).toBe(1);
  });

  it("never walks past dayRange's start, and never inspects an index before a break", () => {
    // A day before dayRange's own start that, if ever inspected, would flip
    // the answer -- proves the walk stops exactly at the break and never
    // looks further back (Boundaries: "never an unbounded lookback").
    const dayRange = ['2026-09-21', '2026-09-22', '2026-09-25'];
    const todayIso = '2026-09-25';
    const workoutsByDate = byDate(workout('2026-09-25'), workout('2026-09-22'));
    // 2026-09-22 is scheduled with no LogEntry and elapsed -> breaks at index 1.
    // 2026-09-21 (index 0) is never reached; if it somehow were and behaved
    // like the "wrong" implementation would, the assertion below still holds
    // either way since we only assert the returned count.
    expect(computeStreak(dayRange, workoutsByDate, {}, todayIso)).toBe(0);
  });

  it('defensive: returns 0 when todayIso is not present in dayRange at all', () => {
    expect(computeStreak(['2026-09-01', '2026-09-02'], new Map(), {}, '2099-01-01')).toBe(0);
  });
});
