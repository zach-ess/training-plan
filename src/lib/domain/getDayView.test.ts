// Story 4.5 -- getDayView carries the Plan's named sessions on 'planned' and
// 'logged' views (display-only), while a LogEntry still wins for
// type/duration/distance per AD-8. First direct test file for getDayView.
import { describe, it, expect } from 'vitest';
import { getDayView } from './getDayView';
import type { Workout } from './parsePlan';

const workout: Workout = {
  date: '2026-10-13',
  type: 'Run',
  duration: '20 min + 40 min strength',
  distance: '2 mi',
  sessions: [
    { name: 'Easy 2 mi', duration: '20 min', distance: '2 mi', instructions: '2 miles easy.' },
    { name: 'LIIFT4 · Chest/Triceps — LIIFT 50/50', duration: '40 min' },
  ],
};

describe('getDayView -- sessions (Story 4.5)', () => {
  it('a planned day carries the Workout values and its sessions', () => {
    expect(getDayView(workout, undefined)).toEqual({
      kind: 'planned',
      type: 'Run',
      duration: '20 min + 40 min strength',
      distance: '2 mi',
      sessions: workout.sessions,
    });
  });

  it('a logged day keeps the LogEntry values but still shows the planned sessions', () => {
    const view = getDayView(workout, { type: 'Run', duration: '25 min', completed: true });
    expect(view).toEqual({ kind: 'logged', type: 'Run', duration: '25 min', completed: true, sessions: workout.sessions });
  });

  it('an orphaned log and an empty day have no sessions', () => {
    expect(getDayView(undefined, { type: 'Bike', completed: true })).not.toHaveProperty('sessions');
    expect(getDayView(undefined, undefined)).toEqual({ kind: 'empty' });
  });

  it('a flat-format Workout (no sessions) is unchanged', () => {
    expect(getDayView({ date: '2026-10-13', type: 'Run', duration: '30 min' }, undefined)).toEqual({
      kind: 'planned',
      type: 'Run',
      duration: '30 min',
      distance: undefined,
    });
  });
});

// Story 5.1 -- the "Missed it" flag rides through on logged/orphaned views,
// read only as `=== true`.
describe('getDayView -- missed (Story 5.1)', () => {
  const flat: Workout = { date: '2026-11-05', type: 'Run', duration: '30 min' };

  it('a logged missed entry exposes missed: true alongside completed: false', () => {
    expect(getDayView(flat, { completed: false, missed: true })).toEqual({ kind: 'logged', completed: false, missed: true });
  });

  it('keeps logged fields on a missed entry that has them', () => {
    const view = getDayView(flat, { completed: false, missed: true, type: 'Run', duration: '10 min' });
    expect(view).toMatchObject({ kind: 'logged', missed: true, type: 'Run', duration: '10 min' });
  });

  it('anything but true is not missed; a planned day has no missed key', () => {
    expect(getDayView(flat, { completed: false, missed: 'true' })).not.toHaveProperty('missed');
    expect(getDayView(flat, { completed: false })).not.toHaveProperty('missed');
    expect(getDayView(flat, undefined)).not.toHaveProperty('missed');
  });
});

// Story 5.1 review -- a missed entry on a date the Plan no longer schedules.
describe('getDayView -- missed entry with no Workout (Story 5.1)', () => {
  it('a bare missed check-in with no Workout is an empty day, not an orphaned log', () => {
    expect(getDayView(undefined, { completed: false, missed: true })).toEqual({ kind: 'empty' });
  });

  it('a missed entry that still carries logged data stays an orphaned log with missed: true', () => {
    expect(getDayView(undefined, { completed: false, missed: true, type: 'Run', duration: '10 min' })).toEqual({
      kind: 'orphaned-log',
      completed: false,
      missed: true,
      type: 'Run',
      duration: '10 min',
    });
    expect(getDayView(undefined, { completed: false, missed: true, notes: 'tired' })).toMatchObject({
      kind: 'orphaned-log',
      missed: true,
    });
  });
});
