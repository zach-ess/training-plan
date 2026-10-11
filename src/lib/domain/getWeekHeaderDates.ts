// Story 4.4 (review loop 1) -- decides which rendered day row each plan
// week's header sits above. Anchoring to `week.startDate` itself isn't
// enough: Claude Coach weeks start on a rest-only Monday, which
// `getPlanDayRange` leaves out of the day list once today has passed it
// (the list starts at the earlier of today and the first scheduled
// workout). So a header goes above the *first rendered date inside the
// week* -- the week's own start when it's shown, otherwise the first of its
// days that is.

import type { PlanWeek } from './parsePlan';

/**
 * Maps a rendered date to the plan week whose header belongs directly above
 * that date's row. A week with no rendered day gets no header; if two weeks
 * would land on the same date (overlapping hand-edited weeks), the one
 * listed first in the Plan keeps it.
 *
 * `dayRange` is `getPlanDayRange`'s ascending list of ISO dates; ISO strings
 * compare chronologically, so plain string comparison is enough.
 */
export function getWeekHeaderDates(dayRange: string[], weeks: PlanWeek[] | undefined): Map<string, PlanWeek> {
  const headers = new Map<string, PlanWeek>();
  if (!weeks || weeks.length === 0) {
    return headers;
  }
  for (const week of weeks) {
    const firstShown = dayRange.find((date) => date >= week.startDate && date <= week.endDate);
    if (firstShown !== undefined && !headers.has(firstShown)) {
      headers.set(firstShown, week);
    }
  }
  return headers;
}
