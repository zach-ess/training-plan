// Story 1.5 -- decides which ISO dates Home renders a row for.

import { parseLocalDate, toLocalIsoDate } from './date';
import type { Workout } from './parsePlan';

/**
 * Returns every ISO date, in order, from
 * `min(earliest workout date, todayIso)` to `max(latest workout date,
 * todayIso)` inclusive. `todayIso` is always folded into the range so
 * today is never excluded even when it falls outside the Plan's own listed
 * span (FR-1) -- an empty `workouts` list therefore still yields the
 * single-date range `[todayIso, todayIso]`.
 *
 * `workouts` dates are plain `YYYY-MM-DD` strings (parsePlan's contract),
 * which compare lexicographically the same as chronologically, so no date
 * parsing is needed to find the min/max -- only to build the day-by-day
 * output range.
 */
export function getPlanDayRange(workouts: Workout[], todayIso: string): string[] {
  let minIso = todayIso;
  let maxIso = todayIso;
  for (const workout of workouts) {
    if (workout.date < minIso) {
      minIso = workout.date;
    }
    if (workout.date > maxIso) {
      maxIso = workout.date;
    }
  }

  const end = parseLocalDate(maxIso);
  const cursor = parseLocalDate(minIso);
  const dates: string[] = [];
  while (cursor.getTime() <= end.getTime()) {
    dates.push(toLocalIsoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}
