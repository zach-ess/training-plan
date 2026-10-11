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
