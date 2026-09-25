// Story 3.3 -- Week-End Review: regression coverage for
// `computeMissedCount`'s elapsed/scheduled/not-done counting rule (this
// spec's Code Map: "mirrors computeStreak's own test... counting over one
// week's 7 dates instead of walking/breaking"). A pure function with no
// Data Store import, so these tests build `entries`/`workoutsByDate`
// directly rather than going through `logStore.svelte.ts`.
import { describe, it, expect } from 'vitest';
import { computeMissedCount } from './computeMissedCount';
import type { Workout } from './parsePlan';

function workout(date: string, overrides: Partial<Workout> = {}): Workout {
  return { date, type: 'Run', duration: '30 min', ...overrides };
}

function byDate(...workouts: Workout[]): Map<string, Workout> {
  return new Map(workouts.map((w) => [w.date, w]));
}

const WEEK = [
  '2026-09-20', // Sun
  '2026-09-21',
  '2026-09-22',
  '2026-09-23',
  '2026-09-24',
  '2026-09-25',
  '2026-09-26', // Sat
];

describe('computeMissedCount', () => {
  it('a fully-elapsed scheduled day with no LogEntry counts as missed', () => {
    const todayIso = '2026-09-27'; // after the whole week
    const workoutsByDate = byDate(workout('2026-09-21'));
    expect(computeMissedCount(WEEK, workoutsByDate, {}, todayIso)).toBe(1);
  });

  it('a scheduled day explicitly logged completed: false counts as missed, same as never logging it', () => {
    const todayIso = '2026-09-27';
    const workoutsByDate = byDate(workout('2026-09-21'));
    const entries: Record<string, unknown> = { '2026-09-21': { completed: false } };
    expect(computeMissedCount(WEEK, workoutsByDate, entries, todayIso)).toBe(1);
  });

  it('a genuinely completed scheduled day never counts as missed', () => {
    const todayIso = '2026-09-27';
    const workoutsByDate = byDate(workout('2026-09-21'));
    const entries: Record<string, unknown> = { '2026-09-21': { completed: true } };
    expect(computeMissedCount(WEEK, workoutsByDate, entries, todayIso)).toBe(0);
  });

  it('a rest day (nothing scheduled) never counts, logged or not', () => {
    const todayIso = '2026-09-27';
    // Nothing scheduled anywhere; one date has an orphaned log explicitly
    // marked completed: false -- still never "missed", since nothing was
    // ever scheduled to miss.
    const entries: Record<string, unknown> = { '2026-09-21': { completed: false } };
    expect(computeMissedCount(WEEK, new Map(), entries, todayIso)).toBe(0);
  });

  it('today itself and any future date within the week are never counted, even if scheduled with nothing logged', () => {
    const todayIso = '2026-09-22'; // mid-week
    const workoutsByDate = byDate(workout('2026-09-22'), workout('2026-09-25'), workout('2026-09-26'));
    // 2026-09-22 (today, planned) and 2026-09-25/26 (future, planned) are all
    // scheduled with no LogEntry, but none is elapsed -- 0 missed.
    expect(computeMissedCount(WEEK, workoutsByDate, {}, todayIso)).toBe(0);
  });

  it('counts every elapsed missed date independently -- an earlier miss never suppresses a later one, and a later genuine completion never erases an earlier miss', () => {
    const todayIso = '2026-09-27';
    const workoutsByDate = byDate(
      workout('2026-09-20'), // missed
      workout('2026-09-21'), // completed
      workout('2026-09-22'), // missed (Mark Incomplete)
      workout('2026-09-23'), // completed
    );
    const entries: Record<string, unknown> = {
      '2026-09-21': { completed: true },
      '2026-09-22': { completed: false },
      '2026-09-23': { completed: true },
    };
    // 2026-09-20: planned, no LogEntry, elapsed -> missed (1)
    // 2026-09-21: logged, completed -> not missed
    // 2026-09-22: logged, completed: false, elapsed -> missed (2)
    // 2026-09-23: logged, completed -> not missed
    // 2026-09-24 through 26: rest days, nothing scheduled -> not missed
    expect(computeMissedCount(WEEK, workoutsByDate, entries, todayIso)).toBe(2);
  });

  it('zero-workout week with everything elapsed: honest zero, not hidden', () => {
    const todayIso = '2026-09-27';
    expect(computeMissedCount(WEEK, new Map(), {}, todayIso)).toBe(0);
  });

  it('elapsed is decided by plain ISO string comparison (local-date semantics), matching computeStreak/DayRowCard', () => {
    const todayIso = '2026-09-21';
    const workoutsByDate = byDate(workout('2026-09-20'));
    // '2026-09-20' < '2026-09-21' lexicographically the same as
    // chronologically -- elapsed and missed.
    expect(computeMissedCount(WEEK, workoutsByDate, {}, todayIso)).toBe(1);
  });

  it('an orphaned-log day (no Workout scheduled) marked completed: false is excluded, not counted as missed', () => {
    const todayIso = '2026-09-27';
    // No Workout scheduled on 2026-09-21 at all -- an orphaned log.
    const entries: Record<string, unknown> = { '2026-09-21': { completed: false } };
    expect(computeMissedCount(WEEK, new Map(), entries, todayIso)).toBe(0);
  });
});
