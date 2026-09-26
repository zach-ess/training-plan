// Story 1.5 -- AD-8's single owner of merging a date's Plan Workout and
// LogEntry for rendering. `DayRowCard`, `WorkoutDetail`/`WorkoutDetailStat`,
// and History's day-by-day rendering are all meant to call this one
// function rather than each writing their own merge logic (AD-8's stated
// purpose). Story 1.5's own call site (`DayRowCard`) originally always
// passed `logEntry: undefined` (Home's day list was untouched by Story 2.2);
// Story 2.2 added `WorkoutDetail` as the first real caller of the
// `'logged'`/`'orphaned-log'` branches, reading an actual LogEntry from the
// new Data Store (`data/logStore.svelte.ts`); Story 2.4 then made `DayRowCard`
// itself LogEntry-aware too (comment updated 2026-09-25 -- was stale after
// that change), so every caller of this function now reads a real LogEntry.
//
// `logEntry` stays deliberately untyped (`unknown`) rather than the
// `LogEntry` interface Story 2.2's Data Store (`data/logStore.svelte.ts`)
// introduced -- every caller (`DayRowCard`, `WorkoutDetail`) reads it the
// same defensively tolerant way `parsePlan` reads a raw Workout, keeping this
// one function correct for any caller without importing the Data Store's
// type into the Derived Domain layer. `readLoggedFields` below is the single
// place that knows LogEntry's field names.

import type { Workout } from './parsePlan';
import { isRecord } from './guards';

export type DayViewKind = 'logged' | 'planned' | 'orphaned-log' | 'empty';

export interface DayView {
  kind: DayViewKind;
  type?: string;
  duration?: string;
  distance?: string;
  // Story 2.2 -- only ever set for `'logged'`/`'orphaned-log'` kinds (read
  // off the LogEntry); left `undefined` for `'planned'`/`'empty'`, where
  // there is no LogEntry to read a completion state from at all.
  completed?: boolean;
}


/** Reads whichever of `type`/`duration`/`distance`/`completed` are present
 * off an opaque LogEntry-shaped value -- mirrors parsePlan's tolerant
 * reading of a raw Workout, since this function still treats `logEntry` as
 * unknown rather than importing the Data Store's `LogEntry` type (see the
 * header comment above). */
function readLoggedFields(
  logEntry: unknown,
): Pick<DayView, 'type' | 'duration' | 'distance' | 'completed'> {
  if (!isRecord(logEntry)) {
    return {};
  }
  const fields: Pick<DayView, 'type' | 'duration' | 'distance' | 'completed'> = {};
  if (typeof logEntry.type === 'string') {
    fields.type = logEntry.type;
  }
  if (typeof logEntry.duration === 'string') {
    fields.duration = logEntry.duration;
  }
  if (typeof logEntry.distance === 'string') {
    fields.distance = logEntry.distance;
  }
  if (typeof logEntry.completed === 'boolean') {
    fields.completed = logEntry.completed;
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
