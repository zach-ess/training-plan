// Epic 4 retro A10 -- Week-End Review reflection drafts. An unsaved
// reflection is kept per week (keyed by the Review's `weekStartIso`, the
// Sunday it's filed under) while it's typed, so closing the Review or tapping
// a tab -- or a reload / Android closing the PWA -- doesn't lose it. A
// successful Save clears that week's draft (`WeekEndReview.svelte`).
//
// Mirrors `weekEndReviewStore.svelte.ts`'s pattern: its own `localStorage`
// key, a tolerant startup load that drops unreadable records with a Story 4.1
// `console.warn`, and a `$state` store object. Unlike that store's `persist`,
// a failed draft write is never surfaced in the UI (this spec's Design Notes:
// a draft is a per-keystroke background autosave, so AD-4's visible error is
// kept for Save, the real commit). The in-memory map is updated regardless,
// so the draft still survives tab taps for this session.

import { isRecord } from '../domain/guards';

export interface ReviewDraft {
  text: string;
  schemaVersion: number;
}

export const CURRENT_DRAFT_SCHEMA_VERSION = 1;

const STORAGE_KEY = 'week-end-review-drafts-v1';

interface ReviewDraftStoreState {
  drafts: Record<string, ReviewDraft>;
}

/** Tolerantly reads one raw stored record -- `null` for anything that isn't
 * an object with string `text`, or whose text is blank (a blank draft is
 * never stored, so one found in storage is just dropped). */
function toReviewDraft(raw: unknown): ReviewDraft | null {
  if (!isRecord(raw) || typeof raw.text !== 'string' || raw.text.trim() === '') {
    return null;
  }
  return {
    text: raw.text,
    schemaVersion: typeof raw.schemaVersion === 'number' ? raw.schemaVersion : CURRENT_DRAFT_SCHEMA_VERSION,
  };
}

function loadInitialDrafts(): Record<string, ReviewDraft> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      console.warn('reviewDraftStore: stored drafts are not an object; starting with none', parsed);
      return {};
    }
    const drafts: Record<string, ReviewDraft> = {};
    for (const [weekStartIso, value] of Object.entries(parsed)) {
      // Same prototype-pollution guard as the other stores' startup loads.
      if (weekStartIso === '__proto__' || weekStartIso === 'constructor' || weekStartIso === 'prototype') {
        console.warn('reviewDraftStore: skipping reserved stored key', weekStartIso);
        continue;
      }
      const draft = toReviewDraft(value);
      if (draft) {
        drafts[weekStartIso] = draft;
      } else {
        console.warn('reviewDraftStore: dropping malformed stored draft', weekStartIso, value);
      }
    }
    return drafts;
  } catch (error) {
    // Story 4.1 -- console only, never UI.
    console.warn('reviewDraftStore: stored drafts could not be read; starting with none', error);
    return {};
  }
}

export const reviewDraftStore: ReviewDraftStoreState = $state({ drafts: loadInitialDrafts() });

/** Writes the whole in-memory map. A failure only warns (Design Notes): the
 * caller has already updated `reviewDraftStore.drafts`, so typing and this
 * session's draft carry on. */
function persist(drafts: Record<string, ReviewDraft>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
  } catch (error) {
    console.warn('reviewDraftStore: draft could not be stored; kept for this session only', error);
  }
}

/** The unsaved reflection for one week, or `''` when there is none. */
export function getDraft(weekStartIso: string): string {
  return reviewDraftStore.drafts[weekStartIso]?.text ?? '';
}

/** Stores a week's draft; blank or whitespace-only text removes it instead. */
export function setDraft(weekStartIso: string, text: string): void {
  if (text.trim() === '') {
    clearDraft(weekStartIso);
    return;
  }
  const next = {
    ...reviewDraftStore.drafts,
    [weekStartIso]: { text, schemaVersion: CURRENT_DRAFT_SCHEMA_VERSION },
  };
  reviewDraftStore.drafts = next;
  persist(next);
}

/** Removes a week's draft (after a successful Save, or when cleared). */
export function clearDraft(weekStartIso: string): void {
  if (!(weekStartIso in reviewDraftStore.drafts)) {
    return;
  }
  const { [weekStartIso]: _removed, ...rest } = reviewDraftStore.drafts;
  reviewDraftStore.drafts = rest;
  persist(rest);
}
