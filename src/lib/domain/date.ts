// Story 1.5 -- shared local-date rule (AD-2: "today," day-elapsed, and week
// boundaries are all computed from the device's local time, never UTC).
//
// `Date.prototype.toISOString()` always renders in UTC, so a naive
// `new Date().toISOString().slice(0, 10)` silently produces the *wrong*
// calendar date for any user west of UTC in the evening (or east of UTC
// in the very early morning) -- exactly the class of bug AD-2 exists to
// prevent. Every ISO-date read in this app should go through
// `toLocalIsoDate`/`getTodayIso` rather than reaching for `toISOString()`
// directly, so this rule has exactly one implementation for Epic 2's
// Streak/Rollup/week-boundary logic to build on too.

/** Formats `d` as a local-time `YYYY-MM-DD` string -- never UTC-shifted. */
export function toLocalIsoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Today's date, in local time, as an ISO `YYYY-MM-DD` string. */
export function getTodayIso(): string {
  return toLocalIsoDate(new Date());
}
