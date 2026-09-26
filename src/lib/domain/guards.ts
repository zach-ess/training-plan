// Epic 3 retro fix (F4, 2026-09-26): the one shared `isRecord` type guard,
// consolidated from 7 hand-duplicated copies (`parsePlan.ts`, `getDayView.ts`,
// `logStore.svelte.ts`, `computeRollup.ts`, `computeTrend.ts`,
// `TrendChart.svelte`, `weekEndReviewStore.svelte.ts`). This is the second
// consecutive epic this exact duplication was flagged in a retrospective
// (Epic 1 retro item 8, Epic 2 retro follow-through: "grew from 2 copies to
// 3 -- the opposite of consolidate") and it had grown to 7 copies by the time
// of Epic 3's retro -- this module is that consolidation, finally done, in
// one pass, the same shape as Epic 1 retro item 7's own successful
// `scanColorWiring` extraction.
//
// A new small module rather than folding this into `date.ts`: `isRecord` is
// a general tolerant-parsing guard with nothing date-specific about it, and
// `date.ts`'s own header comment scopes it to local-date/week-boundary rules
// (AD-2) -- mixing concerns there would just create a different kind of
// drift.

/** True when `value` is a plain, non-null, non-array object -- the one
 * tolerant-parsing guard every "accept what's usable, drop what isn't" read
 * path in this app (LogEntry, WeekEndReview, Plan, Rollup, Trend) builds on
 * before it safely indexes into an otherwise-`unknown` raw value. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
