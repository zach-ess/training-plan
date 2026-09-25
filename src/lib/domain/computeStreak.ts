// Story 2.4 -- Streak Tracking & Missed-Day Indication (FR-8). Pure Streak
// count: walks `dayRange` backward starting at `todayIso`'s own index,
// applying the same count/break/skip rules this story's Boundaries define:
//
// - A day counts toward the Streak whenever it has a LogEntry -- i.e.
//   `getDayView`'s `'logged'` or `'orphaned-log'` kind -- regardless of
//   whether a Workout was scheduled, AND that LogEntry's `completed` field is
//   not `false` (AC1; amended 2026-09-25, `intent_gap`: a LogEntry existing at
//   all is "raw logging," but epics.md's own user story requires "genuine
//   consistency" -- an explicit Mark Incomplete (`completed: false`) is the
//   user saying a day was *not* genuinely done, so it's treated the same as
//   no LogEntry at all for counting purposes). `dayView.completed` is read
//   off the resolved `DayView` itself (only ever set for `'logged'`/
//   `'orphaned-log'` kinds) -- `getDayView`'s own presence-based `kind` is
//   untouched.
// - A rest day (`'empty'`) never breaks the Streak, logged or not (AC2) --
//   the walk just passes through it without incrementing. Same for an
//   `'orphaned-log'` day whose LogEntry is explicitly `completed: false`
//   (amended 2026-09-25): no Workout was ever scheduled for that date, so
//   there's nothing to "miss" -- it doesn't count, but it doesn't break the
//   Streak either, exactly like an untouched rest day.
// - A scheduled day only breaks the Streak once it has fully elapsed
//   (`date < todayIso`, local time) with still no *genuine* completion --
//   either `'planned'` (no LogEntry at all) or `'logged'` with
//   `completed === false` (amended 2026-09-25: an explicit Mark Incomplete on
//   a scheduled day is exactly as "missed" as never logging it) (AC3). Such a
//   day that hasn't elapsed yet -- today itself, since the walk never looks
//   past `todayIso`'s own index -- is skipped entirely: neither counted nor
//   breaking, since "missed" can't be decided before the day ends.
// - The walk stops at the first day that breaks it, or at `dayRange`'s
//   start (the Plan's earliest date) -- never an unbounded lookback.
//
// `entries` stays `Record<string, unknown>` rather than
// `Record<string, LogEntry>` -- no Data Store import here (this story's
// Boundaries: "Pure function, no Data Store import"), mirroring
// `getDayView`'s own `unknown`-typed `logEntry` parameter so this function
// works the same whether its caller ever imported `logStore.svelte.ts` or
// not.
//
// This function and `DayRowCard.svelte`'s own Missed-state check share the
// same local-elapsed test (`date < todayIso`, a plain string comparison --
// ISO dates sort lexicographically the same as chronologically) rather than
// two divergent implementations of "has this day passed."

import { getDayView } from './getDayView';
import type { Workout } from './parsePlan';

export function computeStreak(
  dayRange: string[],
  workoutsByDate: Map<string, Workout>,
  entries: Record<string, unknown>,
  todayIso: string,
): number {
  const todayIndex = dayRange.indexOf(todayIso);
  if (todayIndex === -1) {
    // `getPlanDayRange` always folds `todayIso` into `dayRange` (FR-1), so
    // this is never actually reached by this app's own real caller -- kept
    // as an explicit, total fallback (rather than an unbounded/negative
    // walk) for any other input shape.
    return 0;
  }

  let streak = 0;
  for (let i = todayIndex; i >= 0; i--) {
    const date = dayRange[i];
    const dayView = getDayView(workoutsByDate.get(date), entries[date]);

    if (
      (dayView.kind === 'logged' || dayView.kind === 'orphaned-log') &&
      dayView.completed !== false
    ) {
      streak++;
      continue;
    }
    // A rest day (`'empty'`), or an unscheduled `'orphaned-log'` day
    // explicitly marked `completed: false` (reaching here only because the
    // count condition above -- "logged/orphaned-log AND completed !== false"
    // -- excluded it) -- neither had a Workout scheduled, so there's nothing
    // to "miss": passes through without incrementing or breaking (AC2,
    // extended 2026-09-25).
    if (dayView.kind === 'empty' || dayView.kind === 'orphaned-log') {
      continue;
    }
    // What remains here is exactly `dayView.kind === 'planned'` (no LogEntry
    // at all) or `'logged'` with `completed === false` (a scheduled day
    // explicitly marked Mark Incomplete) -- both break the Streak once fully
    // elapsed, and are otherwise skipped (today's own index is never
    // "< todayIso", per the header comment above).
    if (date < todayIso) {
      break;
    }
  }
  return streak;
}
