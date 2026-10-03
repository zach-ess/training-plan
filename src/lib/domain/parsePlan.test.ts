// Claude Coach format support (2026-10-03): regression coverage for
// `parsePlan` reading a Coach plan's `weeks[].days[].workouts[]` shape and
// folding it into the same flat `Workout[]` the flat `workouts[]` shape
// produces -- plus the flat shape's own existing contract, which had no
// direct test until now.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { parsePlan } from './parsePlan';

afterEach(() => {
  vi.restoreAllMocks();
});

function coachPlan(days: unknown[], extra: Record<string, unknown> = {}) {
  return {
    meta: { event: 'Fall Base Block' },
    preferences: { run: 'miles' },
    weeks: [{ weekNumber: 1, days }],
    ...extra,
  };
}

const REST = { sport: 'rest', type: 'rest', name: 'Rest Day' };
const RUN_4MI = { sport: 'run', type: 'endurance', durationMinutes: 40, distanceMeters: 6437 };
const STRENGTH = { sport: 'strength', type: 'endurance', durationMinutes: 20 };

describe('parsePlan -- flat workouts[] shape', () => {
  it('passes valid entries through and keeps planName', () => {
    const plan = parsePlan({
      planName: 'Placeholder Plan',
      workouts: [{ date: '2026-09-18', type: 'Run', duration: '30 min' }],
    });
    expect(plan).toEqual({
      planName: 'Placeholder Plan',
      workouts: [{ date: '2026-09-18', type: 'Run', duration: '30 min' }],
    });
  });

  it('degrades a non-object or missing workouts to an empty plan', () => {
    expect(parsePlan(null)).toEqual({ workouts: [] });
    expect(parsePlan({ planName: 'x' })).toEqual({ workouts: [] });
  });
});

describe('parsePlan -- Claude Coach weeks[] shape', () => {
  it('drops rest days and uses meta.event as planName', () => {
    const plan = parsePlan(
      coachPlan([
        { date: '2026-10-05', workouts: [REST] },
        { date: '2026-10-06', workouts: [RUN_4MI] },
      ]),
    );
    expect(plan).toEqual({
      planName: 'Fall Base Block',
      workouts: [{ date: '2026-10-06', type: 'Run', duration: '40 min', distance: '4 mi' }],
    });
  });

  it('folds a run plus strength on one date into a single Workout', () => {
    const plan = parsePlan(coachPlan([{ date: '2026-10-13', workouts: [RUN_4MI, STRENGTH] }]));
    expect(plan.workouts).toEqual([
      { date: '2026-10-13', type: 'Run', duration: '40 min + 20 min strength', distance: '4 mi' },
    ]);
  });

  it('maps a strength-only day to the Lift preset with no distance', () => {
    const plan = parsePlan(coachPlan([{ date: '2026-11-25', workouts: [STRENGTH] }]));
    expect(plan.workouts).toEqual([{ date: '2026-11-25', type: 'Lift', duration: '20 min' }]);
  });

  it('passes an unmapped sport through capitalized', () => {
    const plan = parsePlan(coachPlan([{ date: '2026-10-07', workouts: [{ sport: 'swim', durationMinutes: 30 }] }]));
    expect(plan.workouts[0].type).toBe('Swim');
  });

  it('formats distance in km when preferences.run is km', () => {
    const plan = parsePlan(
      coachPlan([{ date: '2026-10-06', workouts: [RUN_4MI] }], { preferences: { run: 'km' } }),
    );
    expect(plan.workouts[0].distance).toBe('6.4 km');
  });

  it('keeps one decimal for fractional miles', () => {
    const plan = parsePlan(
      coachPlan([{ date: '2026-10-06', workouts: [{ sport: 'run', distanceMeters: 21097 }] }]),
    );
    expect(plan.workouts[0].distance).toBe('13.1 mi');
  });

  it('drops a day with an invalid date, with the same warning as the flat shape', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const plan = parsePlan(
      coachPlan([
        { date: '2026-02-30', workouts: [RUN_4MI] },
        { workouts: [RUN_4MI] },
        { date: '2026-10-06', workouts: [RUN_4MI] },
      ]),
    );
    expect(plan.workouts.map((w) => w.date)).toEqual(['2026-10-06']);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('skips malformed weeks, days, and sessions without throwing', () => {
    const plan = parsePlan({
      weeks: [
        null,
        { days: 'nope' },
        { days: [null, { date: '2026-10-06', workouts: 'nope' }, { date: '2026-10-08', workouts: [42, RUN_4MI] }] },
      ],
    });
    expect(plan).toEqual({
      workouts: [{ date: '2026-10-08', type: 'Run', duration: '40 min', distance: '4 mi' }],
    });
  });

  it('prefers an explicit flat workouts[] when a file carries both shapes', () => {
    const plan = parsePlan({
      ...coachPlan([{ date: '2026-10-06', workouts: [RUN_4MI] }]),
      workouts: [{ date: '2026-10-06', type: 'Bike', duration: '60 min' }],
    });
    expect(plan.workouts).toEqual([{ date: '2026-10-06', type: 'Bike', duration: '60 min' }]);
  });
});
