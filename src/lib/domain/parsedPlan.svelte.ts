// Epic 4 retro A5 (F4) -- the one parsed Plan every view reads. App.svelte,
// HistoryView.svelte and WeekEndReview.svelte each used to run
// `parsePlan(planStore.plan)` in their own `$derived`, so every Plan load
// parsed it three times and printed each Story 4.1/4.4 diagnostic three
// times. Derived Domain over the Data Store (ARCHITECTURE-SPINE's layer
// direction): it reads `planStore.plan` and re-parses only when that changes.

import { planStore } from '../data/planStore.svelte';
import { parsePlan, type Plan } from './parsePlan';

const parsedPlan = $derived(parsePlan(planStore.plan));

/** The current Plan, parsed once per `planStore.plan` value. Read it from a
 * `$derived`/template context so a background refetch re-renders in place.
 * "Once" holds while some reader stays mounted (App.svelte always is); if
 * every reader unmounted, the next read could parse again. */
export function getParsedPlan(): Plan {
  return parsedPlan;
}
