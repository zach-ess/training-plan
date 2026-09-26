// Story 3.2 -- Rollups & Trend Chart (FR-9). Pure per-type workout COUNT for
// an inclusive date range -- never a blended total (AC1), never a distance
// sum (this story's Never section: `LogEntry.distance` is free text with
// zero numeric-parsing precedent in this codebase). Mirrors computeStreak.ts's
// own established pattern exactly: a plain exported pure function, no Data
// Store import, `entries: Record<string, unknown>` read the same tolerant,
// field-presence way `getDayView`'s `readLoggedFields` does -- this file
// never imports `logStore.svelte.ts`'s `LogEntry` type.
//
// The closed bucket set mirrors `WorkoutEditForm.svelte`'s own TYPE_PRESETS
// list exactly (Run/Bike/Lift/Mobility/Stretch), plus two catch-alls this
// story's Always section names explicitly: `Unspecified` for a LogEntry with
// no `type` field at all (AC7), and `Other` for a recognized-but-not-preset
// value (WorkoutEditForm's own "Other" free-text, already case-fold+trimmed
// at write time).

import { isRecord } from './guards';

const TYPE_PRESETS = ['Run', 'Bike', 'Lift', 'Mobility', 'Stretch'] as const;

export type RollupType = (typeof TYPE_PRESETS)[number] | 'Other' | 'Unspecified';

export type Rollup = Record<RollupType, number>;

/** Epic 3 retro fix (F6, 2026-09-26): the one shared display order for every
 * `RollupType`, consolidated from 3 hand-duplicated copies of this exact
 * 7-item array (`RollupSummary.svelte`'s own `TYPE_ORDER`,
 * `WeekEndReview.svelte`'s own `TYPE_ORDER` -- which its own comment
 * explicitly said "mirrors RollupSummary.svelte's own TYPE_ORDER precedent"
 * rather than importing it -- and `weekEndReviewStore.svelte.ts`'s own
 * `ROLLUP_TYPES`, used there only for tolerant-read reconstruction, not
 * display). This module already owns `RollupType` itself, so it's the
 * obvious single source of truth for the one fixed order every renderer of
 * it agrees on -- presets first (mirroring `TYPE_PRESETS` above), then the
 * two catch-alls, `Other` before `Unspecified`. */
export const ROLLUP_TYPE_ORDER: RollupType[] = [
  ...TYPE_PRESETS,
  'Other',
  'Unspecified',
];

function isPreset(value: string): value is (typeof TYPE_PRESETS)[number] {
  return (TYPE_PRESETS as readonly string[]).includes(value);
}

function emptyRollup(): Rollup {
  return {
    Run: 0,
    Bike: 0,
    Lift: 0,
    Mobility: 0,
    Stretch: 0,
    Other: 0,
    Unspecified: 0,
  };
}

/** Resolves one raw LogEntry's `type` field into a closed rollup bucket --
 * no `type` at all (or a non-string value) -> `Unspecified` (AC7); a
 * recognized preset -> itself; anything else -> `Other`. */
function resolveType(rawEntry: Record<string, unknown>): RollupType {
  const type = rawEntry.type;
  if (typeof type !== 'string' || type === '') {
    return 'Unspecified';
  }
  return isPreset(type) ? type : 'Other';
}

/**
 * Counts workouts per type for every LogEntry whose date key falls within
 * `[periodStartIso, periodEndIso]`, inclusive -- entries outside the range are
 * excluded (this story's I/O matrix, "mixed-type entries, one period"). Range
 * comparison is a plain ISO string comparison (this app's established
 * local-date convention, same as `computeStreak`'s own `date < todayIso`
 * check) rather than constructing `Date` objects, since ISO dates sort
 * lexicographically the same as chronologically.
 *
 * A malformed stored value (not an object at all) is skipped rather than
 * counted anywhere -- mirrors `getDayView`'s own tolerant-read convention: a
 * bad read degrades quietly instead of crashing or miscounting.
 *
 * A LogEntry explicitly marked `completed: false` (Mark Incomplete) is also
 * skipped -- `setCompleted` preserves that entry's `type`/`duration`/
 * `distance` untouched, so it would otherwise still get counted as a done
 * workout of its type. Mirrors `computeStreak.ts`'s own established rule
 * that an explicit Mark Incomplete is treated as "not genuinely done," not as
 * raw logging.
 */
export function computeRollup(
  entries: Record<string, unknown>,
  periodStartIso: string,
  periodEndIso: string,
): Rollup {
  const rollup = emptyRollup();
  for (const [date, rawEntry] of Object.entries(entries)) {
    if (date < periodStartIso || date > periodEndIso) {
      continue;
    }
    if (!isRecord(rawEntry) || rawEntry.completed !== true) {
      continue;
    }
    const type = resolveType(rawEntry);
    rollup[type]++;
  }
  return rollup;
}
