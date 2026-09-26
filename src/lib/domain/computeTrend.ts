// Story 3.2 -- Rollups & Trend Chart (FR-9). Pure, blended (never per-type --
// contrast `computeRollup`) total workout count per week, across a fixed
// trailing 12-week window ending in the week containing `todayIso` -- always
// returns exactly 12 weeks, oldest first, including zero-count ones (this
// story's Tasks: "always returns all 12 weeks including zero-count ones";
// `TrendChart`, not this function, is responsible for trimming weeks before
// the first-ever Log Entry, AC4).
//
// Mirrors `computeStreak.ts`/`computeRollup.ts`'s own pattern: a plain
// exported pure function, no Data Store import, `entries: Record<string,
// unknown>` read the same tolerant way `getDayView`'s `readLoggedFields`
// does. `todayIso` is an explicit parameter (not read internally via
// `getTodayIso()`) so this function stays a pure, deterministic function of
// its inputs -- the same reason `computeStreak` takes `todayIso` as a
// parameter rather than calling `getTodayIso()` itself.

import { getWeekStartIso, parseLocalDate, toLocalIsoDate } from './date';
import { isRecord } from './guards';

const TREND_WINDOW_WEEKS = 12;

export interface TrendWeek {
  /** The ISO date (a Sunday, local time) that starts this week -- shared
   * vocabulary with `getWeekStartIso`. */
  weekStartIso: string;
  /** Blended total workout count for this week (every LogEntry, regardless
   * of type) -- never a per-type breakdown (contrast `computeRollup`). */
  count: number;
}


/**
 * Returns exactly `TREND_WINDOW_WEEKS` (12) weeks, oldest first, ending with
 * the week containing `todayIso` -- one entry per week regardless of whether
 * any LogEntry falls in it (zero-count weeks are real entries in the
 * returned array, never omitted).
 *
 * A LogEntry whose date falls outside every week in this window (further
 * back than 12 weeks) is silently uncounted -- `computeTrend` only reports on
 * its own fixed window, nothing further back. A malformed stored value (not
 * an object) is skipped, mirroring `computeRollup`'s own tolerant-read
 * convention -- as is a LogEntry explicitly marked `completed: false` (Mark
 * Incomplete), mirroring `computeRollup`'s/`computeStreak.ts`'s own rule that
 * an explicit Mark Incomplete isn't a genuinely done workout.
 */
export function computeTrend(entries: Record<string, unknown>, todayIso: string): TrendWeek[] {
  const currentWeekStartIso = getWeekStartIso(todayIso);
  const currentWeekStart = parseLocalDate(currentWeekStartIso);

  // Oldest-first: index 0 is 11 weeks before the current week, the last
  // entry is the current week itself.
  const weekStarts: string[] = [];
  for (let i = TREND_WINDOW_WEEKS - 1; i >= 0; i--) {
    const weekStart = new Date(
      currentWeekStart.getFullYear(),
      currentWeekStart.getMonth(),
      currentWeekStart.getDate() - i * 7,
    );
    weekStarts.push(toLocalIsoDate(weekStart));
  }

  const counts = new Map<string, number>(weekStarts.map((weekStartIso) => [weekStartIso, 0]));
  for (const [date, rawEntry] of Object.entries(entries)) {
    if (!isRecord(rawEntry) || rawEntry.completed !== true) {
      continue;
    }
    const weekStartIso = getWeekStartIso(date);
    if (counts.has(weekStartIso)) {
      counts.set(weekStartIso, (counts.get(weekStartIso) ?? 0) + 1);
    }
  }

  return weekStarts.map((weekStartIso) => ({ weekStartIso, count: counts.get(weekStartIso) ?? 0 }));
}
