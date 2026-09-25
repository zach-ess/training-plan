// Story 2.2 -- LogEntry Data Store (Architecture's Data Store layer, AD-5),
// the first `localStorage`-backed store in this app (planStore.svelte.ts's
// Plan cache deliberately lives in Cache Storage instead -- see that file's
// header comment; `localStorage` was reserved for LogEntry/WeekEndReview
// data from the start).
//
// Mirrors planStore.svelte.ts's pattern: a `$state`-backed reactive object
// loaded once at module init, with every mutation going through this
// module rather than a component ever touching `localStorage` directly
// (epics.md's Architecture section: "View never reaches localStorage
// directly").
//
// This story ships exactly one write operation, `setCompleted` (AD-9's
// targeted-patch half of the pair). `replaceLogEntry` -- AD-9's full-overwrite
// half, used by Edit -- is deliberately not added here; see this story's
// Design Notes ("replaceLogEntry deliberately deferred to Story 2.3") for why
// shipping it now with no caller would be dead surface. The shared private
// write helper below (`persist`) is built so 2.3 can add it cheaply on top,
// without duplicating the try/catch/schemaVersion plumbing.

import type { Workout } from '../domain/parsePlan';

// Canonical LogEntry field shape (epics.md Technical Decisions / this
// story's Code Map): `date` is the id; `completed` is always explicit;
// `type`/`duration`/`distance`/`notes` are all independently optional --
// omitted entirely when unset, never `null`/`''` (presence check is
// `'key' in entry`); `schemaVersion` is on every record.
export interface LogEntry {
  date: string;
  completed: boolean;
  type?: string;
  duration?: string;
  distance?: string;
  notes?: string;
  schemaVersion: number;
}

// schemaVersion 1 is the only version that has ever existed (this story's
// Never section) -- there is nothing for `migrateLogEntry` below to actually
// migrate yet.
export const CURRENT_SCHEMA_VERSION = 1;

const STORAGE_KEY = 'log-entries-v1';

export type WriteResult = { ok: true } | { ok: false; reason: 'quota-exceeded' | 'write-error' };

interface LogStoreState {
  entries: Record<string, LogEntry>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Tolerantly reads one raw stored record into a `LogEntry`, the same
 * "accept what's usable, drop what isn't" convention `parsePlan.ts` applies
 * to raw Workout entries -- a hand-edited or corrupted `localStorage` value
 * should never crash the read path (AD-3/AD-4's "never silent" is about
 * *writes*; a bad *read* here just drops that one date rather than taking
 * down every other LogEntry alongside it). Returns `null` for anything that
 * isn't at least a real object with a valid `date` and an explicit boolean
 * `completed` -- the two fields the canonical shape always requires. */
function toLogEntry(date: string, raw: unknown): LogEntry | null {
  if (!isRecord(raw) || typeof raw.completed !== 'boolean') {
    return null;
  }
  const entry: LogEntry = {
    date,
    completed: raw.completed,
    schemaVersion: typeof raw.schemaVersion === 'number' ? raw.schemaVersion : CURRENT_SCHEMA_VERSION,
  };
  if (typeof raw.type === 'string') entry.type = raw.type;
  if (typeof raw.duration === 'string') entry.duration = raw.duration;
  if (typeof raw.distance === 'string') entry.distance = raw.distance;
  if (typeof raw.notes === 'string') entry.notes = raw.notes;
  return migrateLogEntry(entry);
}

/**
 * Migration extension point (AD-3: "app startup runs a migration step before
 * any UI reads persisted state if the stored version is behind"). A no-op
 * today -- `CURRENT_SCHEMA_VERSION` (1) is the only version that has ever
 * existed, so no stored record can ever actually be behind it. Documented
 * here, rather than left unwritten, so a future schemaVersion 2 has a single
 * obvious place to add real per-version migration logic instead of bolting
 * it onto the read path ad hoc.
 */
function migrateLogEntry(record: LogEntry): LogEntry {
  if (record.schemaVersion >= CURRENT_SCHEMA_VERSION) {
    return record;
  }
  // No prior schemaVersion has ever shipped, so this branch is unreachable
  // today -- kept explicit rather than omitted so the extension point is
  // real code, not just a comment.
  return { ...record, schemaVersion: CURRENT_SCHEMA_VERSION };
}

/** Reads every entry out of the one `localStorage` key this store owns.
 * Any failure (unsupported/blocked storage, corrupt JSON, an unexpected
 * top-level shape) degrades to "no entries" rather than throwing -- module
 * init must never crash the app over a bad or missing cache entry, mirroring
 * `planStore.svelte.ts`'s own cold-cache-read tolerance. */
function loadInitialEntries(): Record<string, LogEntry> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return {};
    }
    const entries: Record<string, LogEntry> = {};
    for (const [date, value] of Object.entries(parsed)) {
      // Guard against prototype-pollution-via-inherited-setter: a stored key
      // literally named `__proto__` (or `constructor`/`prototype`) would
      // otherwise reach `entries`' own inherited `Object.prototype` setter
      // via this bracket assignment rather than adding a normal own
      // property. Skipping these three keys outright means a hand-edited or
      // maliciously-crafted `localStorage` value can never do that.
      if (date === '__proto__' || date === 'constructor' || date === 'prototype') {
        continue;
      }
      const entry = toLogEntry(date, value);
      if (entry) {
        entries[date] = entry;
      }
    }
    return entries;
  } catch {
    return {};
  }
}

export const logStore: LogStoreState = $state({ entries: loadInitialEntries() });

/** The one shared write path (AD-3/AD-4): every mutation in this module
 * funnels through here. Wraps the actual `localStorage.setItem` in try/catch
 * and distinguishes a quota failure (`QuotaExceededError`, or the older
 * numeric-code spellings some engines still use) from any other write
 * failure, so a caller can show a specific-enough plain-voice message
 * without this module ever throwing. `logStore.entries` is only reassigned
 * by the caller *after* this returns `ok: true` -- see `setCompleted` below
 * -- so a failed write can never move the in-memory `$state` at all, and
 * "nothing else in storage is deleted" (this story's I/O matrix) holds by
 * construction: a failed `setItem` call never touches any other key. */
function persist(entries: Record<string, LogEntry>): WriteResult {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
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

/** Reads the LogEntry for one date, if any -- the only read this store
 * exposes. Called from a `$derived`/reactive context (`WorkoutDetail.svelte`,
 * by way of `getDayView`), so a later successful `setCompleted` write (which
 * reassigns `logStore.entries`) re-renders any reader in place. */
export function getLogEntry(date: string): LogEntry | undefined {
  return logStore.entries[date];
}

/**
 * AD-9's targeted-patch write: creates a LogEntry for `date` if none exists
 * yet (freezing `workout`'s *current* `type`/`duration`/`distance` into it,
 * AD-1's one-time value-freeze -- never re-copied on a later call), or else
 * patches only `completed` on the existing record, leaving every other field
 * (`duration`/`distance`/`type`/`notes`) byte-for-byte untouched. `workout`
 * is only ever consulted on that first-creation branch; passing or omitting
 * it on a call that patches an existing entry changes nothing (this mirrors
 * the epics.md Mark Incomplete call, which omits it entirely).
 *
 * Returns `{ ok: true }` on a successful write or `{ ok: false, reason }` on
 * failure -- never throws. On failure, `logStore.entries` is left exactly as
 * it was (this story's Boundaries: "the in-memory UI state does not
 * change"), so the caller's own UI state (e.g. a "still showing the old
 * label" button) needs no separate rollback.
 *
 * Re-reads and re-parses `localStorage` fresh (via `loadInitialEntries`,
 * the same tolerant parsing module init uses) rather than spreading the
 * possibly-stale in-memory `logStore.entries` -- that in-memory copy is only
 * ever populated once at module init and never re-synced with storage, so
 * spreading it here would silently drop/revert any other date's LogEntry
 * that another tab (or a stale in-memory copy) wrote to storage since. Only
 * the one date actually being patched is merged onto that freshly-read
 * object before persisting, and `logStore.entries` is updated to match
 * exactly what was persisted, not `{ ...logStore.entries, [date]: nextEntry }`.
 */
export function setCompleted(date: string, value: boolean, workout?: Workout): WriteResult {
  const freshEntries = loadInitialEntries();
  const existing = freshEntries[date];

  const nextEntry: LogEntry = existing
    ? { ...existing, completed: value, schemaVersion: CURRENT_SCHEMA_VERSION }
    : {
        date,
        completed: value,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        ...(workout?.type !== undefined ? { type: workout.type } : {}),
        ...(workout?.duration !== undefined ? { duration: workout.duration } : {}),
        ...(workout?.distance !== undefined ? { distance: workout.distance } : {}),
      };

  const nextEntries = { ...freshEntries, [date]: nextEntry };
  const result = persist(nextEntries);
  if (result.ok) {
    logStore.entries = nextEntries;
  }
  return result;
}

// Story 2.3 -- the optional-fields shape `replaceLogEntry` accepts. Every key
// is independently optional (this story's Boundaries: "Every field... is
// independently optional") -- `WorkoutEditForm` is responsible for turning a
// blank/cleared field into a genuinely-omitted key *before* calling this
// function (e.g. an empty duration input becomes `fields.duration ===
// undefined`, not `''`), since this function itself does not know which
// fields the on-screen form even has; it only knows how to write whatever it
// is given.
export type LogEntryFields = Pick<LogEntry, 'type' | 'duration' | 'distance' | 'notes'>;

/**
 * AD-9's full-overwrite write: replaces the entire LogEntry for `date` with a
 * brand-new record built only from `fields` -- unlike `setCompleted`'s
 * `{ ...existing, ... }` patch above, the previous record (if any) is never
 * spread in here, so a key `fields` doesn't carry is genuinely absent from
 * the written record, never persisted as `null`/`''` (this story's Always
 * section / the canonical LogEntry shape's omit-key convention). Used by
 * Edit, where Save always means "this is the whole truth of what happened,"
 * not a partial patch.
 *
 * `completed` is unconditionally set to `true` on every call, regardless of
 * the LogEntry's prior value (decided 2026-09-24) -- saving via Edit is
 * itself an act of logging that the day happened, just possibly with
 * different specifics than planned. This also holds even when neither a
 * Workout nor a prior LogEntry existed for `date` at all (a rest day being
 * logged for the first time): the resulting record is a legitimate
 * orphaned-log LogEntry (AD-8), the same as any other.
 *
 * Same `persist`/fresh-read/never-throws contract as `setCompleted` above:
 * re-reads `localStorage` fresh via `loadInitialEntries` rather than
 * spreading the possibly-stale in-memory `logStore.entries`, and
 * `logStore.entries` is only reassigned to match exactly what was persisted
 * after a successful write -- a failed write leaves it, and every other
 * date's LogEntry, untouched.
 */
export function replaceLogEntry(date: string, fields: LogEntryFields): WriteResult {
  const freshEntries = loadInitialEntries();

  const nextEntry: LogEntry = {
    date,
    completed: true,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    ...(fields.type !== undefined ? { type: fields.type } : {}),
    ...(fields.duration !== undefined ? { duration: fields.duration } : {}),
    ...(fields.distance !== undefined ? { distance: fields.distance } : {}),
    ...(fields.notes !== undefined ? { notes: fields.notes } : {}),
  };

  const nextEntries = { ...freshEntries, [date]: nextEntry };
  const result = persist(nextEntries);
  if (result.ok) {
    logStore.entries = nextEntries;
  }
  return result;
}
