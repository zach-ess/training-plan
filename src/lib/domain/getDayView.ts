// Story 1.5 -- AD-8's single owner of merging a date's Plan Workout and
// LogEntry for rendering. `DayRowCard`, `WorkoutDetail`/`WorkoutDetailStat`,
// and History's day-by-day rendering are all meant to call this one
// function rather than each writing their own merge logic (AD-8's stated
// purpose), even though this story's only call site (`DayRowCard`) always
// passes `logEntry: undefined` -- no Data Store LogEntry read exists until
// Epic 2. The `'logged'`/`'orphaned-log'` branches below exist for AD-8's
// fixed 4-quadrant contract and for Epic 2 to build on, not exercised by
// any call site this story adds.
//
// `logEntry` is deliberately untyped (`unknown`) rather than a `LogEntry`
// interface -- that type doesn't exist yet (Epic 2's Data Store). When it's
// present, its `type`/`duration`/`distance` are read the same defensively
// tolerant way `parsePlan` reads a raw Workout, rather than assuming its
// shape.

import type { Workout } from './parsePlan';

export type DayViewKind = 'logged' | 'planned' | 'orphaned-log' | 'empty';

export interface DayView {
  kind: DayViewKind;
  type?: string;
  duration?: string;
  distance?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reads whichever of `type`/`duration`/`distance` are present as strings
 * off an opaque LogEntry-shaped value -- mirrors parsePlan's tolerant
 * reading of a raw Workout, since neither shape is formally locked yet. */
function readLoggedFields(logEntry: unknown): Pick<DayView, 'type' | 'duration' | 'distance'> {
  if (!isRecord(logEntry)) {
    return {};
  }
  const fields: Pick<DayView, 'type' | 'duration' | 'distance'> = {};
  if (typeof logEntry.type === 'string') {
    fields.type = logEntry.type;
  }
  if (typeof logEntry.duration === 'string') {
    fields.duration = logEntry.duration;
  }
  if (typeof logEntry.distance === 'string') {
    fields.distance = logEntry.distance;
  }
  return fields;
}

/**
 * Merges a date's Plan Workout and LogEntry into a single `DayView`, per
 * AD-8's fixed 4-quadrant contract:
 *
 * - Workout + LogEntry: `'logged'` -- the LogEntry's own stored values win
 *   (AD-1's value-freeze rule).
 * - Workout, no LogEntry: `'planned'` -- the Workout's values, scheduled but
 *   not yet logged.
 * - No Workout, LogEntry: `'orphaned-log'` -- still rendered using the
 *   LogEntry's own values, never downgraded to a bare rest day (AD-8).
 * - Neither: `'empty'` -- nothing scheduled, nothing logged.
 */
export function getDayView(workout: Workout | undefined, logEntry: unknown | undefined): DayView {
  if (workout && logEntry !== undefined) {
    return { kind: 'logged', ...readLoggedFields(logEntry) };
  }
  if (workout && logEntry === undefined) {
    return {
      kind: 'planned',
      type: workout.type,
      duration: workout.duration,
      distance: workout.distance,
    };
  }
  if (!workout && logEntry !== undefined) {
    return { kind: 'orphaned-log', ...readLoggedFields(logEntry) };
  }
  return { kind: 'empty' };
}
