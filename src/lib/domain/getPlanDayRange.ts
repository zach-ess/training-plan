// Story 1.5 -- decides which ISO dates Home renders a row for.

import { addDaysIso, parseLocalDate, toLocalIsoDate } from './date';
import type { Workout } from './parsePlan';

// Epic 1 retro item 5 (finding A8) -- the most days the range may reach
// either side of today. A real plan spans weeks; a typo'd far-off date (e.g.
// 2099) would otherwise build tens of thousands of rows and freeze the tab
// before the error boundary could ever help.
export const MAX_DAYS_FROM_TODAY = 730;

// Three views compute the same range, so warn once per clamped range.
const warnedClamps = new Set<string>();

/**
 * Returns every ISO date, in order, from
 * `min(earliest workout date, todayIso)` to `max(latest workout date,
 * todayIso)` inclusive. `todayIso` is always folded into the range so
 * today is never excluded even when it falls outside the Plan's own listed
 * span (FR-1) -- an empty `workouts` list therefore still yields the
 * single-date range `[todayIso, todayIso]`.
 *
 * Clamped to `MAX_DAYS_FROM_TODAY` days either side of today (Epic 1 retro
 * item 5): a workout dated beyond that window gets no Home/History row and
 * no part in the Streak (which walks this range), and one `console.warn`
 * names the plan bounds and the window shown.
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

  const earliestAllowed = addDaysIso(todayIso, -MAX_DAYS_FROM_TODAY);
  const latestAllowed = addDaysIso(todayIso, MAX_DAYS_FROM_TODAY);
  if (minIso < earliestAllowed || maxIso > latestAllowed) {
    const key = `${minIso}..${maxIso}`;
    if (!warnedClamps.has(key)) {
      warnedClamps.add(key);
      console.warn(
        'getPlanDayRange: plan dates reach more than 2 years from today; showing only that window',
        { planFrom: minIso, planTo: maxIso },
        { shownFrom: minIso < earliestAllowed ? earliestAllowed : minIso, shownTo: maxIso > latestAllowed ? latestAllowed : maxIso },
      );
    }
    minIso = minIso < earliestAllowed ? earliestAllowed : minIso;
    maxIso = maxIso > latestAllowed ? latestAllowed : maxIso;
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
