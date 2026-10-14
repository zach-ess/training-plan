// Story 1.5 -- defensive normalization of Story 1.4's opaque
// `planStore.plan: unknown`. This is the only place that reaches into the
// raw fetched/cached JSON shape; every other call site (getPlanDayRange,
// getDayView, DayRowCard, App.svelte) works only with the typed `Plan`
// this returns.

import { isRecord } from './guards';
import { parseLocalDate, toLocalIsoDate } from './date';

export interface Workout {
  date: string;
  type?: string;
  duration?: string;
  distance?: string;
  /** Story 4.5 -- the day's planned sessions by name, in plan order (Claude
   * Coach plans only; absent for the flat format). Display-only: logging,
   * Streak and Rollups still use the folded type/duration/distance above. */
  sessions?: PlanSession[];
}

/** Story 4.5 -- one planned session within a day, as the Plan names it. */
export interface PlanSession {
  name: string;
  duration?: string;
  distance?: string;
  /** The plan's full coaching text (`humanReadable`), else its short
   * `description`; line breaks kept. */
  instructions?: string;
}

/** Story 4.4 -- one plan week, as a Claude Coach plan defines it (Zach's own
 * Monday-start blocks, not the app's Sunday-ending review week). Only used to
 * label the day lists; never to decide what a day is or how it's logged. */
export interface PlanWeek {
  weekNumber?: number;
  startDate: string;
  endDate: string;
  phase?: string;
  focus?: string;
}

export interface Plan {
  planName?: string;
  workouts: Workout[];
  weeks?: PlanWeek[];
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
  name?: string;
  instructions?: string;
}

function nonEmptyText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function toCoachSession(raw: unknown): CoachSession | null {
  // Epic 4 retro A6 (F5): unusable sessions are dropped with a Story 4.1
  // console note. Rest sessions are skipped silently -- that's by design.
  if (!isRecord(raw)) {
    console.warn('parsePlan: dropping Coach session that is not an object', raw);
    return null;
  }
  if (typeof raw.sport !== 'string') {
    console.warn('parsePlan: dropping Coach session without a string sport', raw);
    return null;
  }
  // Trimmed once, so a padded "rest" is still rest and " run " still maps.
  const sport = raw.sport.trim();
  if (sport === 'rest') {
    return null;
  }
  const session: CoachSession = { sport };
  if (typeof raw.durationMinutes === 'number' && raw.durationMinutes > 0) {
    session.minutes = raw.durationMinutes;
  }
  if (typeof raw.distanceMeters === 'number' && raw.distanceMeters > 0) {
    session.meters = raw.distanceMeters;
  }
  const name = nonEmptyText(raw.name);
  if (name) {
    session.name = name;
  }
  const instructions = nonEmptyText(raw.humanReadable) ?? nonEmptyText(raw.description);
  if (instructions) {
    session.instructions = instructions;
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
 * sums every session that has one. Rest-only days produce no Workout.
 *
 * Story 4.5 -- also builds `workout.sessions` (each session by name, with its
 * own minutes/distance and instructions). `toWorkout` keeps only the flat
 * fields, so `parseCoachPlan` must re-attach `sessions` after validating the
 * date -- change both together. */
function toWorkoutFromCoachDay(date: string, rawSessions: unknown, useMiles: boolean): Workout | null {
  if (!Array.isArray(rawSessions)) {
    return null;
  }
  const sessions = rawSessions.map(toCoachSession).filter((s): s is CoachSession => s !== null);
  if (sessions.length === 0) {
    return null;
  }

  const [primary, ...extras] = sessions;
  // The type and session-name label; a blank sport reads "Workout" (Epic 4
  // retro A6, F5). `sport` is already trimmed by `toCoachSession`.
  const typeLabel = (sport: string) =>
    COACH_SPORT_TYPES[sport] ?? (sport.charAt(0).toUpperCase() + sport.slice(1) || 'Workout');
  const workout: Workout = {
    date,
    type: typeLabel(primary.sport),
  };

  const durationParts: string[] = [];
  if (primary.minutes !== undefined) {
    durationParts.push(`${primary.minutes} min`);
  }
  for (const extra of extras) {
    if (extra.minutes !== undefined) {
      // Deliberately the raw sport ("+ 40 min strength", not the "Lift"
      // label), but never a blank suffix.
      durationParts.push(`${extra.minutes} min ${extra.sport || 'workout'}`);
    }
  }
  if (durationParts.length > 0) {
    workout.duration = durationParts.join(' + ');
  }

  const meters = sessions.reduce((sum, s) => sum + (s.meters ?? 0), 0);
  if (meters > 0) {
    workout.distance = formatDistance(meters, useMiles);
  }

  // Story 4.5 -- each session by name (falling back to its type label), with
  // its own minutes/distance and instructions, for the row title and
  // Workout Detail.
  workout.sessions = sessions.map((s) => {
    const session: PlanSession = { name: s.name ?? typeLabel(s.sport) };
    if (s.minutes !== undefined) {
      session.duration = `${s.minutes} min`;
    }
    if (s.meters !== undefined) {
      session.distance = formatDistance(s.meters, useMiles);
    }
    if (s.instructions) {
      session.instructions = s.instructions;
    }
    return session;
  });
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
    // A non-object week already warns in `parsePlanWeeks`; the rest warn
    // here (Epic 4 retro A6, F5).
    if (!isRecord(week)) {
      continue;
    }
    if (!Array.isArray(week.days)) {
      console.warn('parsePlan: dropping Coach week without a days array', week.weekNumber, week.startDate);
      continue;
    }
    for (const day of week.days) {
      if (!isRecord(day)) {
        console.warn('parsePlan: dropping Coach day that is not an object', day);
        continue;
      }
      if (!Array.isArray(day.workouts)) {
        console.warn('parsePlan: dropping Coach day without a workouts array', day.date);
        continue;
      }
      const folded = toWorkoutFromCoachDay(String(day.date), day.workouts, useMiles);
      const workout = folded && toWorkout(folded);
      if (workout) {
        // `toWorkout` keeps only the flat-format fields; re-attach the
        // sessions it validated the date for (Story 4.5).
        if (folded.sessions) {
          workout.sessions = folded.sessions;
        }
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
 * Either way, a `weeks[]` array also yields `plan.weeks` for the day lists'
 * week headers (Story 4.4), omitted when no week is usable.
 */
export function parsePlan(raw: unknown): Plan {
  const plan = parsePlanWorkouts(raw);
  if (isRecord(raw) && Array.isArray(raw.weeks)) {
    const weeks = parsePlanWeeks(raw.weeks);
    if (weeks.length > 0) {
      plan.weeks = weeks;
    }
  }
  return plan;
}

/** Story 4.4 -- reads `weeks[]` header data (number, date range, phase,
 * focus) whenever a Plan carries it, independent of which shape supplied the
 * workouts. A week without a real ISO `startDate` can't be placed in the day
 * list, so it's dropped with a warning (Story 4.1's convention); a missing or
 * invalid `endDate` falls back to `startDate` + 6 days. */
function parsePlanWeeks(rawWeeks: unknown[]): PlanWeek[] {
  const weeks: PlanWeek[] = [];
  for (const raw of rawWeeks) {
    if (!isRecord(raw)) {
      console.warn('parsePlan: dropping week that is not an object', raw);
      continue;
    }
    if (typeof raw.startDate !== 'string' || !ISO_DATE_RE.test(raw.startDate) || !isRealCalendarDate(raw.startDate)) {
      console.warn('parsePlan: dropping week with invalid or missing startDate', raw.weekNumber, raw.startDate);
      continue;
    }
    const fallbackEnd = parseLocalDate(raw.startDate);
    fallbackEnd.setDate(fallbackEnd.getDate() + 6);
    // An `endDate` before `startDate` (a hand-edit typo) would render an
    // inverted range, so it gets the same +6 fallback as a missing one.
    const endDate =
      typeof raw.endDate === 'string' &&
      ISO_DATE_RE.test(raw.endDate) &&
      isRealCalendarDate(raw.endDate) &&
      raw.endDate >= raw.startDate
        ? raw.endDate
        : toLocalIsoDate(fallbackEnd);

    const week: PlanWeek = { startDate: raw.startDate, endDate };
    if (typeof raw.weekNumber === 'number' && Number.isInteger(raw.weekNumber) && raw.weekNumber > 0) {
      week.weekNumber = raw.weekNumber;
    }
    const phase = typeof raw.phase === 'string' ? raw.phase.trim() : '';
    if (phase !== '') {
      week.phase = phase;
    }
    const focus = typeof raw.focus === 'string' ? raw.focus.trim() : '';
    if (focus !== '') {
      week.focus = focus;
    }
    weeks.push(week);
  }
  return weeks;
}

function parsePlanWorkouts(raw: unknown): Plan {
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
