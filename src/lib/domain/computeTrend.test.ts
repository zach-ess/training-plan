// Story 3.2 -- Rollups & Trend Chart: regression coverage for
// `computeTrend`'s fixed 12-week-window/week-boundary rules. A pure function
// with no Data Store import, so these tests build `entries` directly rather
// than going through `logStore.svelte.ts`. `getWeekStartIso` (this story's
// other new `date.ts` export) is exercised indirectly through every
// assertion here, since `computeTrend` is built entirely on top of it.
import { describe, it, expect } from 'vitest';
import { computeTrend } from './computeTrend';
import { getWeekStartIso, parseLocalDate } from './date';

describe('computeTrend', () => {
  it('always returns exactly 12 weeks, oldest first, ending with the week containing todayIso', () => {
    const todayIso = '2026-09-25'; // a Friday
    const trend = computeTrend({}, todayIso);

    expect(trend).toHaveLength(12);
    expect(trend[trend.length - 1].weekStartIso).toBe(getWeekStartIso(todayIso));
    // Each week is exactly 7 days after the previous one.
    for (let i = 1; i < trend.length; i++) {
      const prev = parseLocalDate(trend[i - 1].weekStartIso);
      const curr = parseLocalDate(trend[i].weekStartIso);
      expect((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24)).toBe(7);
    }
  });

  it('zero entries anywhere: every one of the 12 weeks has a zero count, none omitted', () => {
    const trend = computeTrend({}, '2026-09-25');

    expect(trend).toHaveLength(12);
    expect(trend.every((week) => week.count === 0)).toBe(true);
  });

  it('AC5: entries spanning the full window are blended (never per-type) into one count per week', () => {
    const todayIso = '2026-09-25';
    const entries: Record<string, unknown> = {
      // Same week as todayIso (a Sunday-Saturday span containing 2026-09-25).
      '2026-09-21': { type: 'Run', completed: true },
      '2026-09-22': { type: 'Bike', completed: true }, // different type, same week -- blended together
    };

    const trend = computeTrend(entries, todayIso);
    const currentWeek = trend[trend.length - 1];

    expect(currentWeek.count).toBe(2);
  });

  it('a Log Entry explicitly marked completed: false (Mark Incomplete) is not counted toward its week', () => {
    const todayIso = '2026-09-25';
    const entries: Record<string, unknown> = {
      '2026-09-21': { type: 'Run', completed: false },
    };

    const trend = computeTrend(entries, todayIso);

    expect(trend.every((week) => week.count === 0)).toBe(true);
  });

  it('week boundary is Sunday-Saturday, local time: a Saturday and the following Sunday fall in different weeks', () => {
    const todayIso = '2026-09-25';
    const entries: Record<string, unknown> = {
      '2026-09-19': { type: 'Run', completed: true }, // a Saturday
      '2026-09-20': { type: 'Run', completed: true }, // the next day, a Sunday -- a new week
    };

    const trend = computeTrend(entries, todayIso);
    const saturdayWeek = trend.find((week) => week.weekStartIso === getWeekStartIso('2026-09-19'));
    const sundayWeek = trend.find((week) => week.weekStartIso === getWeekStartIso('2026-09-20'));

    expect(saturdayWeek?.weekStartIso).not.toBe(sundayWeek?.weekStartIso);
    expect(saturdayWeek?.count).toBe(1);
    expect(sundayWeek?.count).toBe(1);
  });

  it('a Log Entry older than the 12-week window is silently uncounted, not attributed to the oldest week', () => {
    const todayIso = '2026-09-25';
    const entries: Record<string, unknown> = {
      '2020-01-01': { type: 'Run' }, // years before the window
    };

    const trend = computeTrend(entries, todayIso);

    expect(trend.every((week) => week.count === 0)).toBe(true);
  });

  it('a malformed stored value (not an object) is skipped rather than counted or crashing', () => {
    const todayIso = '2026-09-25';
    const entries: Record<string, unknown> = {
      '2026-09-25': 'not-an-object',
    };

    const trend = computeTrend(entries, todayIso);

    expect(trend.every((week) => week.count === 0)).toBe(true);
  });
});
