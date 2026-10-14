// Claude Coach format support (2026-10-03): regression coverage for
// `parsePlan` reading a Coach plan's `weeks[].days[].workouts[]` shape and
// folding it into the same flat `Workout[]` the flat `workouts[]` shape
// produces -- plus the flat shape's own existing contract, which had no
// direct test until now.
import { describe, it, expect, vi, afterEach } from 'vitest';
import realPlanText from '../../../public/plan.json?raw';
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
      workouts: [
        {
          date: '2026-10-06',
          type: 'Run',
          duration: '40 min',
          distance: '4 mi',
          sessions: [{ name: 'Run', duration: '40 min', distance: '4 mi' }],
        },
      ],
    });
  });

  it('folds a run plus strength on one date into a single Workout', () => {
    const plan = parsePlan(coachPlan([{ date: '2026-10-13', workouts: [RUN_4MI, STRENGTH] }]));
    expect(plan.workouts).toEqual([
      {
        date: '2026-10-13',
        type: 'Run',
        duration: '40 min + 20 min strength',
        distance: '4 mi',
        sessions: [
          { name: 'Run', duration: '40 min', distance: '4 mi' },
          { name: 'Lift', duration: '20 min' },
        ],
      },
    ]);
  });

  it('maps a strength-only day to the Lift preset with no distance', () => {
    const plan = parsePlan(coachPlan([{ date: '2026-11-25', workouts: [STRENGTH] }]));
    expect(plan.workouts).toEqual([
      { date: '2026-11-25', type: 'Lift', duration: '20 min', sessions: [{ name: 'Lift', duration: '20 min' }] },
    ]);
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
    const workoutDrops = warn.mock.calls.filter((call) => String(call[0]).includes('dropping workout entry'));
    expect(workoutDrops).toHaveLength(2);
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
      workouts: [
        {
          date: '2026-10-08',
          type: 'Run',
          duration: '40 min',
          distance: '4 mi',
          sessions: [{ name: 'Run', duration: '40 min', distance: '4 mi' }],
        },
      ],
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

// Story 4.4 -- week header data, read from `weeks[]` whenever present.
describe('parsePlan -- plan weeks (Story 4.4)', () => {
  const day = { date: '2026-10-13', workouts: [RUN_4MI] };

  it('reads a full week: number, dates, phase, and focus', () => {
    const plan = parsePlan({
      weeks: [
        {
          weekNumber: 1,
          startDate: '2026-10-12',
          endDate: '2026-10-18',
          phase: 'Return',
          focus: 'Ease back in · 8 mi',
          days: [day],
        },
      ],
    });
    expect(plan.weeks).toEqual([
      { weekNumber: 1, startDate: '2026-10-12', endDate: '2026-10-18', phase: 'Return', focus: 'Ease back in · 8 mi' },
    ]);
  });

  it('falls back to startDate + 6 days for a missing or invalid endDate, across a year boundary', () => {
    const plan = parsePlan({
      weeks: [
        { weekNumber: 12, startDate: '2026-12-28', days: [] },
        { weekNumber: 13, startDate: '2027-01-04', endDate: 'soon', days: [] },
      ],
    });
    expect(plan.weeks?.map((w) => w.endDate)).toEqual(['2027-01-03', '2027-01-10']);
  });

  it('omits missing weekNumber, phase, and focus rather than inventing them', () => {
    const plan = parsePlan({ weeks: [{ startDate: '2026-10-12', phase: '  ', days: [] }] });
    expect(plan.weeks).toEqual([{ startDate: '2026-10-12', endDate: '2026-10-18' }]);
  });

  it('drops a week with an invalid or missing startDate, with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const plan = parsePlan({
      weeks: [
        { weekNumber: 1, startDate: '2026-13-01', days: [] },
        { weekNumber: 2, days: [] },
        { weekNumber: 3, startDate: '2026-10-26', days: [] },
      ],
    });
    expect(plan.weeks?.map((w) => w.weekNumber)).toEqual([3]);
    const weekDrops = warn.mock.calls.filter((call) => String(call[0]).includes('dropping week'));
    expect(weekDrops).toHaveLength(2);
  });

  it('a flat-only plan has no weeks property', () => {
    expect(parsePlan({ workouts: [{ date: '2026-10-13', type: 'Run' }] })).not.toHaveProperty('weeks');
  });

  it('a file with both shapes keeps its flat workouts and still exposes weeks', () => {
    const plan = parsePlan({
      workouts: [{ date: '2026-10-13', type: 'Bike' }],
      weeks: [{ weekNumber: 1, startDate: '2026-10-12', days: [day] }],
    });
    expect(plan.workouts).toEqual([{ date: '2026-10-13', type: 'Bike' }]);
    expect(plan.weeks?.[0].startDate).toBe('2026-10-12');
  });
});

describe('parsePlan -- plan week validation (Story 4.4 review loop 1)', () => {
  it('replaces an endDate earlier than startDate with the +6 fallback', () => {
    const plan = parsePlan({ weeks: [{ startDate: '2026-10-12', endDate: '2026-10-05', days: [] }] });
    expect(plan.weeks?.[0].endDate).toBe('2026-10-18');
  });

  it('keeps weekNumber only when it is a positive integer', () => {
    const plan = parsePlan({
      weeks: [
        { weekNumber: 0, startDate: '2026-10-12', days: [] },
        { weekNumber: -1, startDate: '2026-10-19', days: [] },
        { weekNumber: 1.5, startDate: '2026-10-26', days: [] },
        { weekNumber: 4, startDate: '2026-11-02', days: [] },
      ],
    });
    expect(plan.weeks?.map((w) => w.weekNumber)).toEqual([undefined, undefined, undefined, 4]);
  });

  it('stores phase and focus trimmed', () => {
    const plan = parsePlan({ weeks: [{ startDate: '2026-10-12', phase: ' Return ', focus: '  Ease back in \n', days: [] }] });
    expect(plan.weeks?.[0]).toMatchObject({ phase: 'Return', focus: 'Ease back in' });
  });

  it('drops a non-object week entry with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const plan = parsePlan({ weeks: [null, 'week', { startDate: '2026-10-12', days: [] }] });
    expect(plan.weeks).toHaveLength(1);
    expect(warn.mock.calls.filter((call) => String(call[0]).includes('week that is not an object'))).toHaveLength(2);
  });
});

// Story 4.5 -- each Coach day keeps its sessions by name, with their own
// minutes/distance and full instructions; flat plans and rest days carry none.
describe('parsePlan -- session names (Story 4.5)', () => {
  const EASY = {
    sport: 'run',
    name: 'Easy 2 mi',
    description: 'Short note.',
    humanReadable: '2 miles easy.\nZone 2 HR (139-152).',
    durationMinutes: 20,
    distanceMeters: 3219,
  };
  const LIIFT = {
    sport: 'strength',
    name: 'LIIFT4 · Chest/Triceps — LIIFT 50/50',
    description: 'LIIFT4 Build It, week 1.',
    durationMinutes: 40,
  };

  it('a run + lift day keeps both sessions in plan order, with full instructions preferred over the short note', () => {
    const plan = parsePlan(coachPlan([{ date: '2026-10-13', workouts: [EASY, LIIFT] }]));
    expect(plan.workouts[0].duration).toBe('20 min + 40 min strength');
    expect(plan.workouts[0].sessions).toEqual([
      { name: 'Easy 2 mi', duration: '20 min', distance: '2 mi', instructions: '2 miles easy.\nZone 2 HR (139-152).' },
      { name: 'LIIFT4 · Chest/Triceps — LIIFT 50/50', duration: '40 min', instructions: 'LIIFT4 Build It, week 1.' },
    ]);
  });

  it('a lift-only day has one named session', () => {
    const plan = parsePlan(coachPlan([{ date: '2026-10-12', workouts: [REST, LIIFT] }]));
    expect(plan.workouts[0]).toMatchObject({ type: 'Lift', sessions: [{ name: LIIFT.name }] });
  });

  it('a nameless or blank-named session falls back to its type label', () => {
    const plan = parsePlan(coachPlan([{ date: '2026-10-13', workouts: [{ sport: 'run', name: '  ', durationMinutes: 30 }] }]));
    expect(plan.workouts[0].sessions).toEqual([{ name: 'Run', duration: '30 min' }]);
  });

  it('rest-only days produce no workout, and flat plans carry no sessions', () => {
    expect(parsePlan(coachPlan([{ date: '2026-10-12', workouts: [REST] }])).workouts).toEqual([]);
    expect(parsePlan({ workouts: [{ date: '2026-10-13', type: 'Run' }] }).workouts[0]).not.toHaveProperty('sessions');
  });
});

describe('parsePlan -- session edge cases (Story 4.5 review)', () => {
  it('per-session distance follows preferences.run (km)', () => {
    const plan = parsePlan(
      coachPlan([{ date: '2026-10-13', workouts: [{ sport: 'run', name: 'Easy', distanceMeters: 6437 }] }], {
        preferences: { run: 'km' },
      }),
    );
    expect(plan.workouts[0].sessions?.[0].distance).toBe('6.4 km');
  });

  it('a whitespace-only humanReadable falls back to the short description', () => {
    const plan = parsePlan(
      coachPlan([{ date: '2026-10-13', workouts: [{ sport: 'run', name: 'Easy', humanReadable: '   ', description: 'Short.' }] }]),
    );
    expect(plan.workouts[0].sessions?.[0].instructions).toBe('Short.');
  });

  it('a session with a blank sport and no name is named "Workout", never blank', () => {
    const plan = parsePlan(coachPlan([{ date: '2026-10-13', workouts: [{ sport: '  ', durationMinutes: 20 }] }]));
    expect(plan.workouts[0].sessions?.[0].name).toBe('Workout');
  });
});

// Epic 4 retro A6 (F5): the Coach path's remaining drops warn (Story 4.1),
// and a blank sport reads "Workout" for the type too.
describe('parsePlan -- Coach drops warn, blank sport (Epic 4 retro A6)', () => {
  function warnings(warn: ReturnType<typeof vi.spyOn>, text: string) {
    return warn.mock.calls.filter((call: unknown[]) => String(call[0]).includes(text));
  }

  it('warns once for a week without a days array, naming the week', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const plan = parsePlan({
      weeks: [
        { weekNumber: 2, startDate: '2026-10-19' },
        { weekNumber: 3, startDate: '2026-10-26', days: [{ date: '2026-10-27', workouts: [RUN_4MI] }] },
      ],
    });
    expect(plan.workouts.map((w) => w.date)).toEqual(['2026-10-27']);
    const drops = warnings(warn, 'Coach week without a days array');
    expect(drops).toHaveLength(1);
    expect(drops[0].slice(1)).toEqual([2, '2026-10-19']);
  });

  it('a non-object week warns only once (from the week-header parse), not twice', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    parsePlan({ weeks: ['oops', { weekNumber: 1, startDate: '2026-10-12', days: [] }] });
    expect(warnings(warn, 'week that is not an object')).toHaveLength(1);
    expect(warnings(warn, 'Coach week')).toHaveLength(0);
  });

  it('warns for a non-object day and keeps the valid one', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const plan = parsePlan(coachPlan([null, { date: '2026-10-13', workouts: [RUN_4MI] }]));
    expect(plan.workouts.map((w) => w.date)).toEqual(['2026-10-13']);
    expect(warnings(warn, 'Coach day that is not an object')).toEqual([
      ['parsePlan: dropping Coach day that is not an object', null],
    ]);
  });

  it('warns for a non-object session and one without a string sport, keeping the rest of the day', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const noSport = { name: 'Mystery', durationMinutes: 10 };
    const plan = parsePlan(coachPlan([{ date: '2026-10-13', workouts: ['oops', noSport, RUN_4MI] }]));
    expect(plan.workouts[0].sessions?.map((s) => s.name)).toEqual(['Run']);
    expect(warnings(warn, 'Coach session that is not an object')).toEqual([
      ['parsePlan: dropping Coach session that is not an object', 'oops'],
    ]);
    expect(warnings(warn, 'Coach session without a string sport')).toEqual([
      ['parsePlan: dropping Coach session without a string sport', noSport],
    ]);
  });

  it('stays silent for rest sessions and a well-formed plan', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    parsePlan({
      weeks: [
        {
          weekNumber: 1,
          startDate: '2026-10-12',
          days: [
            { date: '2026-10-12', workouts: [REST] },
            { date: '2026-10-13', workouts: [RUN_4MI, STRENGTH] },
          ],
        },
      ],
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('a blank sport reads "Workout" for the type, and a blank extra session never leaves a bare suffix', () => {
    const plan = parsePlan(
      coachPlan([
        { date: '2026-10-13', workouts: [{ sport: '  ', durationMinutes: 20 }] },
        { date: '2026-10-14', workouts: [RUN_4MI, { sport: '', durationMinutes: 15 }] },
      ]),
    );
    expect(plan.workouts[0].type).toBe('Workout');
    expect(plan.workouts[1].type).toBe('Run');
    expect(plan.workouts[1].duration).toBe('40 min + 15 min workout');
  });

  it('warns for a day without a workouts array, naming its date', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const plan = parsePlan(coachPlan([{ date: '2026-10-12' }, { date: '2026-10-13', workouts: [RUN_4MI] }]));
    expect(plan.workouts.map((w) => w.date)).toEqual(['2026-10-13']);
    expect(warnings(warn, 'Coach day without a workouts array')).toEqual([
      ['parsePlan: dropping Coach day without a workouts array', '2026-10-12'],
    ]);
  });

  it('trims a padded sport: " rest " is still rest, " run " still maps to Run', () => {
    const plan = parsePlan(
      coachPlan([
        { date: '2026-10-12', workouts: [{ sport: ' rest ' }] },
        { date: '2026-10-13', workouts: [{ sport: ' run ', durationMinutes: 30 }, { sport: ' yoga ', durationMinutes: 10 }] },
      ]),
    );
    expect(plan.workouts.map((w) => w.date)).toEqual(['2026-10-13']);
    expect(plan.workouts[0].type).toBe('Run');
    expect(plan.workouts[0].duration).toBe('30 min + 10 min yoga');
    expect(plan.workouts[0].sessions?.map((s) => s.name)).toEqual(['Run', 'Yoga']);
  });

  it('the repo\x27s real Coach plan (public/plan.json) parses with no warnings', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const plan = parsePlan(JSON.parse(realPlanText));
    expect(plan.workouts.length).toBeGreaterThan(0);
    expect(warn).not.toHaveBeenCalled();
  });

  it('a well-formed extra session keeps its raw sport in the duration', () => {
    const plan = parsePlan(coachPlan([{ date: '2026-10-13', workouts: [RUN_4MI, STRENGTH] }]));
    expect(plan.workouts[0].duration).toBe('40 min + 20 min strength');
  });
});
