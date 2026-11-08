// Story 5.2 -- the unchecked-day counter on Home. Pure, derived at read time
// and never stored (AD-2). Mirrors `computeMissedCount`'s loop shape, but
// with Epic 5's "checked" rule instead of "missed":
//
// - A planned day (a Plan Workout exists, so `getDayView` is `'planned'` or
//   `'logged'`) is checked once its LogEntry is `completed: true` or
//   `missed: true`. Anything else -- no entry, or a Mark-Incomplete entry --
//   is unchecked.
// - Only dates before today count. Today is reported separately as
//   `todayOpen`; future dates, rest days (`'empty'`, including a bare missed
//   entry with no Workout) and `'orphaned-log'` days never count.
// - Only dates in `dates` (Home's `dayRange`) are inspected.
//
// Story 5.3's service worker computes the same number at push time from a
// mirrored snapshot, so this definition must not diverge from it.

import { getDayView } from './getDayView';
import type { Workout } from './parsePlan';

export interface UncheckedCount {
  count: number;
  todayOpen: boolean;
}

export function computeUncheckedCount(
  dates: string[],
  workoutsByDate: Map<string, Workout>,
  entries: Record<string, unknown>,
  todayIso: string,
): UncheckedCount {
  let count = 0;
  let todayOpen = false;
  for (const date of dates) {
    if (date > todayIso) {
      continue;
    }
    const dayView = getDayView(workoutsByDate.get(date), entries[date]);
    const isPlanned = dayView.kind === 'planned' || dayView.kind === 'logged';
    const isChecked = dayView.completed === true || dayView.missed === true;
    if (!isPlanned || isChecked) {
      continue;
    }
    if (date === todayIso) {
      todayOpen = true;
    } else {
      count++;
    }
  }
  return { count, todayOpen };
}
