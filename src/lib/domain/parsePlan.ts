// Story 1.5 -- defensive normalization of Story 1.4's opaque
// `planStore.plan: unknown`. This is the only place that reaches into the
// raw fetched/cached JSON shape; every other call site (getPlanDayRange,
// getDayView, DayRowCard, App.svelte) works only with the typed `Plan`
// this returns.

import { isRecord } from './guards';

export interface Workout {
  date: string;
  type?: string;
  duration?: string;
  distance?: string;
}

export interface Plan {
  planName?: string;
  workouts: Workout[];
}

// Architecture's Consistency Conventions: "Dates are ISO 8601 strings
// (YYYY-MM-DD) everywhere a date is stored, compared, or passed between
// layers." getPlanDayRange relies on this shape both for lexicographic
// min/max comparison and for constructing a local `Date` from the string --
// so a `date` that isn't actually in this form is treated the same as a
// missing one (dropped) rather than risking a garbage range or an Invalid
// Date downstream.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Confirms a string that already matched `ISO_DATE_RE` also names a real
 * calendar date. The regex alone accepts out-of-range values like
 * `"2026-13-05"` (month 13) or `"2026-02-30"`; the native `Date` constructor
 * silently rolls those over into a *different*, later calendar date instead
 * of rejecting them (e.g. `new Date(2026, 12, 5)` becomes 2027-01-05). Left
 * unchecked, that rolled-over value is what `getPlanDayRange` uses to widen
 * its rendered range, while every other reader (e.g. `App.svelte`'s
 * date-keyed Map) still keys on the original, un-rolled-over string -- so
 * the Workout itself silently vanishes from its own row while the day list
 * balloons to cover the bogus rolled-over date. Round-tripping through
 * `Date`'s own getters and comparing back to the input catches this: a
 * genuine calendar date always survives the round trip unchanged. */
function isRealCalendarDate(iso: string): boolean {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
  );
}

/** A raw array entry is treated as a Workout only if it at least carries a
 * usable ISO `date` string -- everything else (`type`/`duration`/`distance`)
 * is independently optional per the Design Notes' tolerant-reading rule, so
 * only a non-string value for one of those is worth stripping rather than
 * passed through as-is. A malformed entry (not an object, no valid ISO
 * `date`, or a `date` that doesn't name a real calendar date) is dropped
 * rather than rendered, since there's no trustworthy date to key a row on --
 * consistent with this function never throwing regardless of what a future
 * `plan.json` shape change (or a hand-edit typo) puts in the array. */
function toWorkout(raw: unknown): Workout | null {
  if (!isRecord(raw)) {
    return null;
  }
  if (
    typeof raw.date !== 'string' ||
    !ISO_DATE_RE.test(raw.date) ||
    !isRealCalendarDate(raw.date)
  ) {
    // Diagnostic only -- this is a hand-authored, single-user plan.json, so
    // a dropped entry (a typo'd date, most likely) is otherwise silent and
    // hard to notice: the workout just never appears, with no error and no
    // visible sign of why. This never throws and never blocks rendering
    // (the "always degrades, never crashes" guarantee is unchanged) -- it
    // only makes a dropped entry visible to whoever opens devtools.
    console.warn('parsePlan: dropping workout entry with invalid or missing date', raw);
    return null;
  }

  const workout: Workout = { date: raw.date };
  if (typeof raw.type === 'string') {
    workout.type = raw.type;
  }
  if (typeof raw.duration === 'string') {
    workout.duration = raw.duration;
  }
  if (typeof raw.distance === 'string') {
    workout.distance = raw.distance;
  }
  return workout;
}

// Claude Coach format (2026-10-03) -- the plan generator Zach actually uses
// emits `weeks[].days[].workouts[]` (one entry per session, with a lowercase
// `sport`, numeric `durationMinutes`/`distanceMeters`, and `rest` entries for
// rest days), not this app's flat `workouts[]`. Rather than requiring a
// hand-converted copy of every new plan, `parsePlan` reads that shape too and
// folds it down into the same flat `Workout[]` everything downstream already
// consumes -- so this file stays the only place that knows any raw shape.

/** Coach `sport` values mapped onto this app's type presets (the same five
 * `WorkoutEditForm`/`computeRollup` use). Anything unmapped is passed through
 * capitalized, which `computeRollup` then buckets as "Other". */
const COACH_SPORT_TYPES: Record<string, string> = {
  run: 'Run',
  bike: 'Bike',
  strength: 'Lift',
  mobility: 'Mobility',
  stretch: 'Stretch',
};

const METERS_PER_MILE = 1609.344;

interface CoachSession {
  sport: string;
  minutes?: number;
  meters?: number;
}

function toCoachSession(raw: unknown): CoachSession | null {
  if (!isRecord(raw) || typeof raw.sport !== 'string' || raw.sport === 'rest') {
    return null;
  }
  const session: CoachSession = { sport: raw.sport };
  if (typeof raw.durationMinutes === 'number' && raw.durationMinutes > 0) {
    session.minutes = raw.durationMinutes;
  }
  if (typeof raw.distanceMeters === 'number' && raw.distanceMeters > 0) {
    session.meters = raw.distanceMeters;
  }
  return session;
}

function formatDistance(meters: number, useMiles: boolean): string {
  const value = useMiles ? meters / METERS_PER_MILE : meters / 1000;
  // One decimal at most, trailing ".0" dropped -- "3 mi", "13.1 mi".
  return `${Math.round(value * 10) / 10} ${useMiles ? 'mi' : 'km'}`;
}

/** Folds one Coach day's sessions into the single Workout this app keys by
 * date (AD-1 -- one LogEntry per date, so one Workout per date too). The
 * first session is the day's primary and supplies `type`; any further
 * sessions (e.g. strength after a run) are appended to `duration` as
 * "+ 20 min strength" so they stay visible without a second row. Distance
 * sums every session that has one. Rest-only days produce no Workout. */
function toWorkoutFromCoachDay(date: string, rawSessions: unknown, useMiles: boolean): Workout | null {
  if (!Array.isArray(rawSessions)) {
    return null;
  }
  const sessions = rawSessions.map(toCoachSession).filter((s): s is CoachSession => s !== null);
  if (sessions.length === 0) {
    return null;
  }

  const [primary, ...extras] = sessions;
  const workout: Workout = {
    date,
    type: COACH_SPORT_TYPES[primary.sport] ?? primary.sport.charAt(0).toUpperCase() + primary.sport.slice(1),
  };

  const durationParts: string[] = [];
  if (primary.minutes !== undefined) {
    durationParts.push(`${primary.minutes} min`);
  }
  for (const extra of extras) {
    if (extra.minutes !== undefined) {
      durationParts.push(`${extra.minutes} min ${extra.sport}`);
    }
  }
  if (durationParts.length > 0) {
    workout.duration = durationParts.join(' + ');
  }

  const meters = sessions.reduce((sum, s) => sum + (s.meters ?? 0), 0);
  if (meters > 0) {
    workout.distance = formatDistance(meters, useMiles);
  }
  return workout;
}

/** Reads a Claude Coach plan's `weeks[].days[]` into flat Workouts, routing
 * each day's `date` through the same `toWorkout` validation the flat shape
 * uses so a malformed date is dropped (with its warning) identically. */
function parseCoachPlan(raw: Record<string, unknown>, weeks: unknown[]): Plan {
  const preferences = isRecord(raw.preferences) ? raw.preferences : {};
  const useMiles = preferences.run !== 'km';

  const workouts: Workout[] = [];
  for (const week of weeks) {
    if (!isRecord(week) || !Array.isArray(week.days)) {
      continue;
    }
    for (const day of week.days) {
      if (!isRecord(day)) {
        continue;
      }
      const folded = toWorkoutFromCoachDay(String(day.date), day.workouts, useMiles);
      const workout = folded && toWorkout(folded);
      if (workout) {
        workouts.push(workout);
      }
    }
  }

  const plan: Plan = { workouts };
  const meta = isRecord(raw.meta) ? raw.meta : {};
  if (typeof meta.event === 'string') {
    plan.planName = meta.event;
  }
  return plan;
}

/**
 * Normalizes `planStore.plan` (opaque per Story 1.4) into a usable `Plan`.
 * Any shape mismatch -- not an object, `workouts` missing/not an array, or
 * individual malformed entries -- degrades to `{ workouts: [] }` (or that
 * array with the bad entries dropped) rather than throwing, so Home's
 * `'loaded'` panel can never crash on an unexpected Plan shape (Story 1.6's
 * error boundary doesn't exist yet).
 *
 * Accepts either this app's own flat `workouts[]` shape or a Claude Coach
 * plan's `weeks[]` shape (see `parseCoachPlan` above). A file carrying both
 * uses the flat `workouts[]`, so an explicit hand-written list always wins.
 */
export function parsePlan(raw: unknown): Plan {
  if (isRecord(raw) && !Array.isArray(raw.workouts) && Array.isArray(raw.weeks)) {
    return parseCoachPlan(raw, raw.weeks);
  }
  if (!isRecord(raw) || !Array.isArray(raw.workouts)) {
    return { workouts: [] };
  }

  const workouts: Workout[] = [];
  for (const entry of raw.workouts) {
    const workout = toWorkout(entry);
    if (workout) {
      workouts.push(workout);
    }
  }

  const plan: Plan = { workouts };
  if (typeof raw.planName === 'string') {
    plan.planName = raw.planName;
  }
  return plan;
}
