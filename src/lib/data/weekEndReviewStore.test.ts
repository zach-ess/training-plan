// Story 3.3 -- Week-End Review Data Store: regression coverage mirroring
// `logStore.svelte.ts`'s own conventions (this store's header comment: "mirrors
// logStore.svelte.ts's own pattern exactly"). `weekEndReviewStore` is a real,
// module-level singleton with no reset between tests in this file, so each
// test uses its own `weekStartIso` -- the same convention
// `HistoryView.test.ts`/`DayRowCard.test.ts` already establish for
// `logStore`.
import { describe, it, expect, vi } from 'vitest';
import {
  weekEndReviewStore,
  getReview,
  saveReview,
  CURRENT_SCHEMA_VERSION,
  type WeekEndReviewInput,
} from './weekEndReviewStore.svelte';
import { computeRollup } from '../domain/computeRollup';

const STORAGE_KEY = 'week-end-reviews-v1';

function input(weekStartIso: string, overrides: Partial<WeekEndReviewInput> = {}): WeekEndReviewInput {
  return {
    weekStartIso,
    workoutsCompleted: 3,
    byType: computeRollup({ [weekStartIso]: { type: 'Run', completed: true } }, weekStartIso, weekStartIso),
    streak: 5,
    missedCount: 1,
    reflection: 'A solid week.',
    ...overrides,
  };
}

describe('weekEndReviewStore -- getReview/saveReview', () => {
  it('getReview returns undefined for a week with nothing saved', () => {
    expect(getReview('2026-08-02')).toBeUndefined();
  });

  it('saveReview writes the full record, in one shot, and getReview reads it back with a stamped schemaVersion', () => {
    const weekStartIso = '2026-08-09';
    const result = saveReview(input(weekStartIso));

    expect(result).toEqual({ ok: true });
    const saved = getReview(weekStartIso);
    expect(saved).toBeDefined();
    expect(saved?.weekStartIso).toBe(weekStartIso);
    expect(saved?.workoutsCompleted).toBe(3);
    expect(saved?.streak).toBe(5);
    expect(saved?.missedCount).toBe(1);
    expect(saved?.reflection).toBe('A solid week.');
    expect(saved?.byType.Run).toBe(1);
    expect(saved?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('a zero-workout week still saves and reads back honest zeros, never hidden', () => {
    const weekStartIso = '2026-08-16';
    saveReview(
      input(weekStartIso, {
        workoutsCompleted: 0,
        byType: computeRollup({}, weekStartIso, weekStartIso),
        streak: 0,
        missedCount: 0,
        reflection: '',
      }),
    );

    const saved = getReview(weekStartIso);
    expect(saved?.workoutsCompleted).toBe(0);
    expect(saved?.streak).toBe(0);
    expect(saved?.missedCount).toBe(0);
    expect(saved?.reflection).toBe('');
    expect(Object.values(saved?.byType ?? {}).every((count) => count === 0)).toBe(true);
  });

  it('persists under week-end-reviews-v1, never colliding with log-entries-v1', () => {
    const weekStartIso = '2026-08-23';
    saveReview(input(weekStartIso));

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string);
    expect(parsed[weekStartIso]).toBeDefined();
    expect(localStorage.getItem('log-entries-v1')).not.toBe(raw);
  });

  it('reflects into weekEndReviewStore.reviews (the reactive $state object) on a successful write', () => {
    const weekStartIso = '2026-08-30';
    saveReview(input(weekStartIso));
    expect(weekEndReviewStore.reviews[weekStartIso]?.workoutsCompleted).toBe(3);
  });

  it('a quota-exceeded write failure returns the specific reason and never touches the in-memory store', () => {
    const weekStartIso = '2026-09-06';
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded (simulated)', 'QuotaExceededError');
    });

    const result = saveReview(input(weekStartIso));

    expect(result).toEqual({ ok: false, reason: 'quota-exceeded' });
    expect(getReview(weekStartIso)).toBeUndefined();
    expect(weekEndReviewStore.reviews[weekStartIso]).toBeUndefined();

    spy.mockRestore();
  });

  it('a non-quota write failure returns write-error and never touches the in-memory store', () => {
    const weekStartIso = '2026-09-13';
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('simulated failure');
    });

    const result = saveReview(input(weekStartIso));

    expect(result).toEqual({ ok: false, reason: 'write-error' });
    expect(getReview(weekStartIso)).toBeUndefined();

    spy.mockRestore();
  });

  it("a failed write to one week's Review never touches another week's already-saved Review", () => {
    const savedWeek = '2026-09-20';
    const failingWeek = '2026-09-27';
    saveReview(input(savedWeek));

    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('simulated failure');
    });
    saveReview(input(failingWeek));
    spy.mockRestore();

    expect(getReview(savedWeek)?.workoutsCompleted).toBe(3);
    expect(getReview(failingWeek)).toBeUndefined();
  });
});

describe('weekEndReviewStore -- tolerant load (fresh module re-import over a manipulated localStorage)', () => {
  it('a corrupted (non-JSON) stored value degrades to no reviews rather than throwing at import time', async () => {
    localStorage.setItem(STORAGE_KEY, 'not valid json{{{');

    vi.resetModules();
    const fresh = await import('./weekEndReviewStore.svelte');

    expect(fresh.getReview('2026-01-04')).toBeUndefined();
  });

  it('a raw record missing everything but workoutsCompleted still loads, with the rest defaulted', async () => {
    const weekStartIso = '2026-01-11';
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ [weekStartIso]: { workoutsCompleted: 4 } }));

    vi.resetModules();
    const fresh = await import('./weekEndReviewStore.svelte');

    const review = fresh.getReview(weekStartIso);
    expect(review?.workoutsCompleted).toBe(4);
    expect(review?.streak).toBe(0);
    expect(review?.missedCount).toBe(0);
    expect(review?.reflection).toBe('');
    expect(review?.byType.Run).toBe(0);
    expect(review?.schemaVersion).toBe(1);
  });

  it('a raw record with no workoutsCompleted at all is dropped, not loaded as a garbage Review', async () => {
    const weekStartIso = '2026-01-18';
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ [weekStartIso]: { reflection: 'no numbers here' } }));

    vi.resetModules();
    const fresh = await import('./weekEndReviewStore.svelte');

    expect(fresh.getReview(weekStartIso)).toBeUndefined();
  });

  it('a stored key literally named __proto__ is skipped rather than reaching Object.prototype', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      '{"__proto__": {"workoutsCompleted": 99}, "2026-01-25": {"workoutsCompleted": 2}}',
    );

    vi.resetModules();
    const fresh = await import('./weekEndReviewStore.svelte');

    expect(fresh.getReview('2026-01-25')?.workoutsCompleted).toBe(2);
    expect(({} as Record<string, unknown>).workoutsCompleted).toBeUndefined();
  });
});
