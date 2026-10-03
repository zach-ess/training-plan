// Story 3.3 -- Week-End Review Data Store (Architecture's Data Store layer,
// AD-5). Mirrors `logStore.svelte.ts`'s own pattern exactly (this story's
// Always section): a `$state`-backed reactive object loaded once at module
// init, its own `localStorage` key (`week-end-reviews-v1`, never
// `log-entries-v1` -- the two stores must never collide), the same tolerant
// load / `WriteResult` / quota-vs-write-error `persist()` shape.
//
// Unlike `logStore.svelte.ts`'s `setCompleted` (a targeted patch, AD-9), this
// story's one write operation (`saveReview`) always writes a WeekEndReview in
// full, in one shot, and never partially updates or re-derives it after read-
// back (this story's Always section, AD-9's scoped exception) -- there is no
// "patch just the reflection" or "patch just one number" path at all, by
// design: a WeekEndReview is immutable once saved (Never section).

import type { Rollup } from '../domain/computeRollup';
import { ROLLUP_TYPE_ORDER } from '../domain/computeRollup';
import { parseLocalDate } from '../domain/date';
import { isRecord } from '../domain/guards';

// Canonical WeekEndReview field shape (this story's Always section):
// `weekStartIso` is the id (that week's Sunday, `getWeekStartIso`'s own
// output); every number/`byType`/`reflection` field is written once, in
// full, at Save time -- there is no independently-optional field the way
// LogEntry's `type`/`duration`/`distance`/`notes` are, since every one of
// these is always computed (never user-typed except `reflection`, which is
// always present even as an empty string -- Save never blocks on it being
// blank).
export interface WeekEndReview {
  weekStartIso: string;
  workoutsCompleted: number;
  byType: Rollup;
  streak: number;
  missedCount: number;
  reflection: string;
  schemaVersion: number;
}

// schemaVersion 1 is the only version that has ever existed (mirrors
// logStore.svelte.ts's own Never section) -- nothing for `migrateReview`
// below to actually migrate yet.
export const CURRENT_SCHEMA_VERSION = 1;

const STORAGE_KEY = 'week-end-reviews-v1';

export type WriteResult = { ok: true } | { ok: false; reason: 'quota-exceeded' | 'write-error' };

interface WeekEndReviewStoreState {
  reviews: Record<string, WeekEndReview>;
}

// Epic 3 retro fix (F6, 2026-09-26): this used to be its own hand-duplicated
// local copy of `computeRollup.ts`'s closed bucket set, kept local only
// because that module didn't export any such list at the time. It now does
// (`ROLLUP_TYPE_ORDER`), so this reuses that export directly -- used here
// purely so a hand-edited/corrupted stored `byType` value can be tolerantly
// reconstructed key-by-key on read, the same "accept what's usable, drop
// what isn't" convention `toLogEntry` applies to LogEntry's own fields.

/** Tolerantly reconstructs a `Rollup` from an opaque raw value -- any key
 * missing or not a number defaults to `0` rather than dropping the whole
 * record, mirroring `computeRollup.ts`'s own "every bucket is zero, never
 * omitted" convention. */
function toRollup(raw: unknown): Rollup {
  const rollup = {} as Rollup;
  for (const type of ROLLUP_TYPE_ORDER) {
    rollup[type] = isRecord(raw) && typeof raw[type] === 'number' ? raw[type] : 0;
  }
  return rollup;
}

/** Tolerantly reads one raw stored record into a `WeekEndReview` -- same
 * "accept what's usable, drop what isn't" convention `logStore.svelte.ts`'s
 * own `toLogEntry` applies: a hand-edited or corrupted `localStorage` value
 * should never crash the read path, just drop that one week rather than
 * taking down every other saved Review alongside it. Returns `null` for
 * anything that isn't at least a real object with a numeric
 * `workoutsCompleted` -- the one field every genuine saved Review always
 * has. */
function toWeekEndReview(weekStartIso: string, raw: unknown): WeekEndReview | null {
  if (!isRecord(raw) || typeof raw.workoutsCompleted !== 'number') {
    return null;
  }
  return migrateReview({
    weekStartIso,
    workoutsCompleted: raw.workoutsCompleted,
    byType: toRollup(raw.byType),
    streak: typeof raw.streak === 'number' ? raw.streak : 0,
    missedCount: typeof raw.missedCount === 'number' ? raw.missedCount : 0,
    reflection: typeof raw.reflection === 'string' ? raw.reflection : '',
    schemaVersion: typeof raw.schemaVersion === 'number' ? raw.schemaVersion : CURRENT_SCHEMA_VERSION,
  });
}

/**
 * Migration extension point (AD-3: "app startup runs a migration step before
 * any UI reads persisted state if the stored version is behind"). A no-op
 * today -- `CURRENT_SCHEMA_VERSION` (1) is the only version that has ever
 * existed, so no stored record can ever actually be behind it. Mirrors
 * `logStore.svelte.ts`'s own `migrateLogEntry` -- documented here, rather
 * than left unwritten, so a future schemaVersion 2 has a single obvious place
 * to add real per-version migration logic.
 */
function migrateReview(record: WeekEndReview): WeekEndReview {
  if (record.schemaVersion >= CURRENT_SCHEMA_VERSION) {
    return record;
  }
  // Unreachable today -- kept explicit rather than omitted, same as
  // logStore.svelte.ts's own migrateLogEntry.
  return { ...record, schemaVersion: CURRENT_SCHEMA_VERSION };
}

/** Reads every saved Review out of the one `localStorage` key this store
 * owns. Any failure (unsupported/blocked storage, corrupt JSON, an
 * unexpected top-level shape) degrades to "no reviews" rather than throwing
 * -- module init must never crash the app over a bad or missing cache entry,
 * mirroring `logStore.svelte.ts`'s own `loadInitialEntries`. */
function loadInitialReviews(): Record<string, WeekEndReview> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      console.warn('weekEndReviewStore: stored reviews are not an object; starting with none', parsed);
      return {};
    }
    const reviews: Record<string, WeekEndReview> = {};
    for (const [weekStartIso, value] of Object.entries(parsed)) {
      // Same prototype-pollution guard as `logStore.svelte.ts`'s own
      // `loadInitialEntries` -- a stored key literally named `__proto__`
      // (or `constructor`/`prototype`) must never reach `reviews`' inherited
      // `Object.prototype` setter via this bracket assignment.
      if (weekStartIso === '__proto__' || weekStartIso === 'constructor' || weekStartIso === 'prototype') {
        console.warn('weekEndReviewStore: skipping reserved stored key', weekStartIso);
        continue;
      }
      const review = toWeekEndReview(weekStartIso, value);
      if (review) {
        reviews[weekStartIso] = review;
      } else {
        console.warn('weekEndReviewStore: dropping malformed stored review', weekStartIso, value);
      }
    }
    return reviews;
  } catch (error) {
    // Story 4.1 -- console only, never UI (epic-1-retro-item-9).
    console.warn('weekEndReviewStore: stored reviews could not be read; starting with none', error);
    return {};
  }
}

export const weekEndReviewStore: WeekEndReviewStoreState = $state({ reviews: loadInitialReviews() });

/** The one shared write path (AD-3/AD-4), mirroring `logStore.svelte.ts`'s
 * own `persist` exactly: wraps `localStorage.setItem` in try/catch and
 * distinguishes a quota failure from any other write failure, so a caller
 * can show a specific-enough plain-voice message without this module ever
 * throwing. `weekEndReviewStore.reviews` is only reassigned by the caller
 * *after* this returns `ok: true` -- a failed write can never move the
 * in-memory `$state` at all, and no other week's saved Review is ever
 * touched by a failed `setItem` call. */
function persist(reviews: Record<string, WeekEndReview>): WriteResult {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reviews));
    return { ok: true };
  } catch (error) {
    const isQuotaError =
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' ||
        error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        error.code === 22 ||
        error.code === 1014);
    return { ok: false, reason: isQuotaError ? 'quota-exceeded' : 'write-error' };
  }
}

/** Reads the saved WeekEndReview for one week, if any -- the only read this
 * store exposes. Called from a `$derived`/reactive context
 * (`WeekEndReview.svelte`, and `App.svelte`/`HistoryView.svelte` for the
 * banner/saved-row gating), so a later successful `saveReview` write (which
 * reassigns `weekEndReviewStore.reviews`) re-renders any reader in place. */
export function getReview(weekStartIso: string): WeekEndReview | undefined {
  return weekEndReviewStore.reviews[weekStartIso];
}

/** Epic 3 retro fix (F3, 2026-09-26): true when `date` is a Sunday whose week
 * already has a saved Review -- the one predicate that decides whether a
 * day-row's tap opens the read-only Week-End Review instead of the ordinary
 * WorkoutDetail dialog (this story's Decisions). Originally written only
 * inside `HistoryView.svelte`; extracted here once a whole-epic review found
 * `App.svelte`'s own Home day-list needed the identical check -- the same
 * date rendered a row in both places, but only History's routed correctly,
 * so the identical date opened two different dialogs depending on which tab
 * was active. Both call sites now import this one function rather than each
 * keeping (or silently drifting from) their own copy. */
export function isSavedReviewSunday(date: string): boolean {
  return parseLocalDate(date).getDay() === 0 && weekEndReviewStore.reviews[date] !== undefined;
}

// The shape `saveReview` accepts -- every field this story's rollup-grid
// computes, plus the reflection text, minus `schemaVersion` (this function's
// own concern, never the caller's).
export type WeekEndReviewInput = Omit<WeekEndReview, 'schemaVersion'>;

/**
 * Writes a week's whole WeekEndReview in one shot (this story's Always
 * section: "written once, in full, on Save; never partially updated or
 * re-derived after read-back"). Unlike `logStore.svelte.ts`'s
 * `setCompleted`/`replaceLogEntry`, there is no existing-record merge here at
 * all -- `input` alone (plus a freshly-stamped `schemaVersion`) becomes the
 * entire record for `input.weekStartIso`, overwriting anything previously
 * saved for that week outright. A week is only ever saved once in normal use
 * (the banner disappears the moment a save succeeds, and a saved week's row
 * opens read-only, per this story's Decisions), so this is not a real re-save
 * path in practice -- but it stays a full overwrite rather than a
 * conditional "only if absent" write so this function's own contract needs
 * no separate case for "what if one already exists."
 *
 * Same `persist`/fresh-read/never-throws contract as `logStore.svelte.ts`'s
 * write operations: re-reads `localStorage` fresh via `loadInitialReviews`
 * rather than spreading the possibly-stale in-memory
 * `weekEndReviewStore.reviews`, and `weekEndReviewStore.reviews` is only
 * reassigned to match exactly what was persisted after a successful write --
 * a failed write leaves it, and every other week's saved Review, untouched.
 */
export function saveReview(input: WeekEndReviewInput): WriteResult {
  const freshReviews = loadInitialReviews();

  const nextReview: WeekEndReview = {
    ...input,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };

  const nextReviews = { ...freshReviews, [input.weekStartIso]: nextReview };
  const result = persist(nextReviews);
  if (result.ok) {
    weekEndReviewStore.reviews = nextReviews;
  }
  return result;
}
