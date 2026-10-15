// Epic 1 retro item 5 (finding A8) -- the day range is clamped to two years
// either side of today, so a typo'd far-off plan date can't freeze the app.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { getPlanDayRange, MAX_DAYS_FROM_TODAY } from './getPlanDayRange';
import type { Workout } from './parsePlan';

const TODAY = '2026-10-14';

function run(date: string): Workout {
  return { date, type: 'Run' };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getPlanDayRange', () => {
  it('spans the earliest to the latest workout, with today folded in, unclamped for a real plan', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const range = getPlanDayRange([run('2026-10-12'), run('2027-01-30')], TODAY);
    expect(range[0]).toBe('2026-10-12');
    expect(range.at(-1)).toBe('2027-01-30');
    expect(range).toHaveLength(111);
    expect(warn).not.toHaveBeenCalled();
  });

  it('clamps a far-future typo to two years after today', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const range = getPlanDayRange([run('2026-10-12'), run('2099-01-01')], TODAY);
    expect(range[0]).toBe('2026-10-12');
    expect(range.at(-1)).toBe('2028-10-13');
    expect(range).toHaveLength(733);
  });

  it('clamps a far-past typo to two years before today', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const range = getPlanDayRange([run('1999-01-01'), run('2026-10-20')], TODAY);
    expect(range[0]).toBe('2024-10-14');
    expect(range.at(-1)).toBe('2026-10-20');
  });

  it('never exceeds the cap either side, and keeps the boundary days themselves', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const range = getPlanDayRange([run('1900-01-01'), run('2999-12-31')], TODAY);
    expect(range).toHaveLength(2 * MAX_DAYS_FROM_TODAY + 1);
    expect(range).toContain(TODAY);
    const exact = getPlanDayRange([run('2024-10-14'), run('2028-10-13')], TODAY);
    expect(exact).toHaveLength(2 * MAX_DAYS_FROM_TODAY + 1);
  });

  it('warns once per clamped range, naming the plan bounds, however many views ask', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const workouts = [run('2026-10-12'), run('2150-06-01')];
    getPlanDayRange(workouts, TODAY);
    getPlanDayRange(workouts, TODAY);
    getPlanDayRange(workouts, TODAY);
    const clamps = warn.mock.calls.filter((call: unknown[]) => String(call[0]).startsWith('getPlanDayRange:'));
    expect(clamps).toHaveLength(1);
    expect(clamps[0].slice(1)).toEqual([
      { planFrom: '2026-10-12', planTo: '2150-06-01' },
      { shownFrom: '2026-10-12', shownTo: '2028-10-13' },
    ]);
  });

  it('a different clamped range warns again', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    getPlanDayRange([run('2026-10-12'), run('2160-01-01')], TODAY);
    getPlanDayRange([run('2026-10-12'), run('2170-01-01')], TODAY);
    expect(warn.mock.calls.filter((call: unknown[]) => String(call[0]).startsWith('getPlanDayRange:'))).toHaveLength(2);
  });

  it('an all-far-past plan runs from two years back to today', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const range = getPlanDayRange([run('1990-01-01'), run('1990-02-01')], TODAY);
    expect(range[0]).toBe('2024-10-14');
    expect(range.at(-1)).toBe(TODAY);
  });
});
