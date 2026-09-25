// Story 3.3 -- Week-End Review. Pure days-missed COUNT over an arbitrary
// list of dates (this story's own Code Map: "mirrors computeStreak's
// elapsed/scheduled/not-done test... counting over one week's 7 dates
// instead of walking/breaking"). Unlike `computeStreak`, this never walks
// backward and never breaks -- every date in `dates` is inspected
// independently, so an earlier missed day never suppresses a later one and a
// later genuinely-completed day never "erases" an earlier miss the way a
// break would end computeStreak's walk.
//
// The same elapsed/scheduled/not-done test as `computeStreak.ts`/
// `DayRowCard.svelte`'s own Missed-state derivation, restated here as a
// counting predicate rather than a walk-and-break:
//
// - A date only counts as missed once fully elapsed (`date < todayIso`,
//   local time, the same plain string comparison every other elapsed check
//   in this app uses -- ISO dates sort lexicographically the same as
//   chronologically). Today itself, or any future date, is never counted --
//   "missed" can't be decided before the day ends.
// - Among elapsed dates, one counts only when it was scheduled
//   (`getDayView`'s `'planned'` kind -- a Workout with no LogEntry at all) or
//   scheduled-and-explicitly-Mark-Incomplete (`'logged'` with
//   `completed === false`) -- amended 2026-09-25's rule that an explicit
//   Mark Incomplete on a scheduled day is exactly as "missed" as never
//   logging it (computeStreak.ts's own header comment states the same rule).
// - A rest day (`'empty'`), an `'orphaned-log'` day (nothing scheduled, so
//   there's nothing to miss regardless of its own `completed` value), and a
//   `'logged'` day with `completed !== false` (a genuine completion) never
//   count.
//
// No `workout !== undefined` guard is needed here the way `DayRowCard`'s own
// derivation includes one defensively -- by `getDayView`'s own contract,
// `'planned'`/`'logged'` are only ever reachable when `workout` is already
// truthy, so the `dayView.kind` check alone is sufficient (the same
// observation `DayRowCard.svelte`'s own comment makes about its analogous
// guard).
//
// `entries` stays `Record<string, unknown>` rather than a typed `LogEntry`
// record -- no Data Store import here, mirroring `computeStreak.ts`'s own
// established convention for this Derived Domain layer.

import { getDayView } from './getDayView';
import type { Workout } from './parsePlan';

export function computeMissedCount(
  dates: string[],
  workoutsByDate: Map<string, Workout>,
  entries: Record<string, unknown>,
  todayIso: string,
): number {
  let missedCount = 0;
  for (const date of dates) {
    // Not yet elapsed (today or a future date) -- "missed" can't be decided
    // before the day ends, mirroring computeStreak's own skip of today.
    if (date >= todayIso) {
      continue;
    }
    const dayView = getDayView(workoutsByDate.get(date), entries[date]);
    if (dayView.kind === 'planned' || (dayView.kind === 'logged' && dayView.completed === false)) {
      missedCount++;
    }
  }
  return missedCount;
}
