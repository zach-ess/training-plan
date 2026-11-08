// Story 5.2 -- coverage for `computeUncheckedCount`, one case per I/O matrix
// row. A pure function, so "today" is a plain argument: the boundary-day rule
// (the day itself, the day after, two days after) is tested by varying it.
import { describe, it, expect } from 'vitest';
import { computeUncheckedCount } from './computeUncheckedCount';
import type { Workout } from './parsePlan';

function workout(date: string, overrides: Partial<Workout> = {}): Workout {
  return { date, type: 'Run', duration: '30 min', ...overrides };
}

function byDate(...workouts: Workout[]): Map<string, Workout> {
  return new Map(workouts.map((w) => [w.date, w]));
}

const DATES = ['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25'];

describe('computeUncheckedCount', () => {
  it('nothing past yet (plan starts tomorrow): 0, today not open', () => {
    const w = byDate(workout('2026-09-21'), workout('2026-09-22'));
    expect(computeUncheckedCount(DATES, w, {}, '2026-09-20')).toEqual({ count: 0, todayOpen: false });
  });

  it('two past planned days with no entries count 2', () => {
    const w = byDate(workout('2026-09-21'), workout('2026-09-22'));
    expect(computeUncheckedCount(DATES, w, {}, '2026-09-24')).toEqual({ count: 2, todayOpen: false });
  });

  it('a completed day is checked', () => {
    const w = byDate(workout('2026-09-21'), workout('2026-09-22'));
    const entries = { '2026-09-21': { completed: true } };
    expect(computeUncheckedCount(DATES, w, entries, '2026-09-24').count).toBe(1);
  });

  it('a "Missed it" day is checked, bare or carrying logged data', () => {
    const w = byDate(workout('2026-09-21'), workout('2026-09-22'));
    const entries = {
      '2026-09-21': { completed: false, missed: true },
      '2026-09-22': { completed: false, missed: true, type: 'Run', duration: '10 min' },
    };
    expect(computeUncheckedCount(DATES, w, entries, '2026-09-24').count).toBe(0);
  });

  it('a Mark-Incomplete entry ({completed:false}, no missed) still counts as unchecked', () => {
    const w = byDate(workout('2026-09-21'));
    const entries = { '2026-09-21': { completed: false } };
    expect(computeUncheckedCount(DATES, w, entries, '2026-09-24').count).toBe(1);
  });

  it('missed: anything other than true is not a check-in', () => {
    const w = byDate(workout('2026-09-21'));
    const entries = { '2026-09-21': { completed: false, missed: false } };
    expect(computeUncheckedCount(DATES, w, entries, '2026-09-24').count).toBe(1);
  });

  it('rest days, logged rest days (orphaned), bare missed rest days and future planned days never count', () => {
    const w = byDate(workout('2026-09-25'));
    const entries = {
      '2026-09-21': { completed: false, type: 'Run' }, // orphaned-log, not completed
      '2026-09-22': { completed: true, type: 'Run' }, // orphaned-log, completed
      '2026-09-23': { completed: false, missed: true }, // bare missed, no Workout
    };
    expect(computeUncheckedCount(DATES, w, entries, '2026-09-24')).toEqual({ count: 0, todayOpen: false });
  });

  it('days outside the given date range never count', () => {
    const w = byDate(workout('2026-09-10'), workout('2026-09-21'));
    expect(computeUncheckedCount(DATES, w, {}, '2026-09-24').count).toBe(1);
  });

  describe('boundary days: planned day X, nothing logged', () => {
    const X = '2026-09-22';
    const w = byDate(workout(X));

    it('today = X: 0 and today is open', () => {
      expect(computeUncheckedCount(DATES, w, {}, X)).toEqual({ count: 0, todayOpen: true });
    });

    it('today = X+1: counted, today not open', () => {
      expect(computeUncheckedCount(DATES, w, {}, '2026-09-23')).toEqual({ count: 1, todayOpen: false });
    });

    it('today = X+2: still counted', () => {
      expect(computeUncheckedCount(DATES, w, {}, '2026-09-24')).toEqual({ count: 1, todayOpen: false });
    });
  });

  it('today planned and completed, or marked missed: today not open', () => {
    const w = byDate(workout('2026-09-22'));
    expect(computeUncheckedCount(DATES, w, { '2026-09-22': { completed: true } }, '2026-09-22').todayOpen).toBe(false);
    expect(
      computeUncheckedCount(DATES, w, { '2026-09-22': { completed: false, missed: true } }, '2026-09-22').todayOpen,
    ).toBe(false);
  });

  it('today planned with a Mark-Incomplete entry: today still open', () => {
    const w = byDate(workout('2026-09-22'));
    expect(computeUncheckedCount(DATES, w, { '2026-09-22': { completed: false } }, '2026-09-22').todayOpen).toBe(true);
  });

  it('today a rest day: today not open', () => {
    const w = byDate(workout('2026-09-21'));
    expect(computeUncheckedCount(DATES, w, {}, '2026-09-22')).toEqual({ count: 1, todayOpen: false });
  });
});
