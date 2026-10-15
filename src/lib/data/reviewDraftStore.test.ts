// Epic 4 retro A10 -- Week-End Review reflection drafts. The store is a
// module-level singleton loaded at import time, so every test resets the
// module registry and imports a fresh copy after arranging its storage
// (the same pattern as `diagnostics.test.ts`); a second fresh import stands
// in for an app restart.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const KEY = 'week-end-review-drafts-v1';

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

function warnCall(prefix: string): unknown[] | undefined {
  return warn.mock.calls.find((call: unknown[]) => typeof call[0] === 'string' && call[0].startsWith(prefix));
}

function load() {
  return import('./reviewDraftStore.svelte');
}

function stored(): unknown {
  const raw = localStorage.getItem(KEY);
  return raw === null ? null : JSON.parse(raw);
}

describe('reviewDraftStore startup load', () => {
  it('loads valid stored drafts silently', async () => {
    localStorage.setItem(KEY, JSON.stringify({ '2026-10-11': { text: 'Good week', schemaVersion: 1 } }));
    const { getDraft } = await load();
    expect(getDraft('2026-10-11')).toBe('Good week');
    expect(warn).not.toHaveBeenCalled();
  });

  it('starts empty and silent with nothing stored', async () => {
    const { getDraft, reviewDraftStore } = await load();
    expect(reviewDraftStore.drafts).toEqual({});
    expect(getDraft('2026-10-11')).toBe('');
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns with the error and starts empty when the stored value is not JSON', async () => {
    localStorage.setItem(KEY, '{not json');
    const { reviewDraftStore } = await load();
    expect(reviewDraftStore.drafts).toEqual({});
    expect(warnCall('reviewDraftStore: stored drafts could not be read')?.[1]).toBeInstanceOf(SyntaxError);
  });

  it('warns and starts empty when the stored value is not an object', async () => {
    localStorage.setItem(KEY, JSON.stringify(['Good week']));
    const { reviewDraftStore } = await load();
    expect(reviewDraftStore.drafts).toEqual({});
    expect(warnCall('reviewDraftStore: stored drafts are not an object')).toBeDefined();
  });

  it('warns about and drops only a bad record, keeping the valid one', async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        '2026-10-11': { text: 'Good week', schemaVersion: 1 },
        '2026-10-18': { text: 42 },
      }),
    );
    const { reviewDraftStore } = await load();
    expect(Object.keys(reviewDraftStore.drafts)).toEqual(['2026-10-11']);
    expect(warnCall('reviewDraftStore: dropping malformed stored draft')?.slice(1)).toEqual([
      '2026-10-18',
      { text: 42 },
    ]);
  });

  it('warns when skipping a reserved key', async () => {
    localStorage.setItem(KEY, '{"constructor": {"text": "x", "schemaVersion": 1}}');
    const { reviewDraftStore } = await load();
    expect(Object.keys(reviewDraftStore.drafts)).toEqual([]);
    expect(warnCall('reviewDraftStore: skipping reserved stored key')?.[1]).toBe('constructor');
  });
});

describe('reviewDraftStore writes', () => {
  it('setDraft stores the text per week with a schemaVersion', async () => {
    const { setDraft, getDraft } = await load();
    setDraft('2026-10-11', 'Good week');
    setDraft('2026-10-18', 'Tired');
    expect(getDraft('2026-10-11')).toBe('Good week');
    expect(getDraft('2026-10-18')).toBe('Tired');
    expect(stored()).toEqual({
      '2026-10-11': { text: 'Good week', schemaVersion: 1 },
      '2026-10-18': { text: 'Tired', schemaVersion: 1 },
    });
  });

  it('blank or whitespace-only text removes the week\x27s draft', async () => {
    const { setDraft, getDraft } = await load();
    setDraft('2026-10-11', 'Good week');
    setDraft('2026-10-11', '  \n ');
    expect(getDraft('2026-10-11')).toBe('');
    expect(stored()).toEqual({});
  });

  it('clearDraft removes only that week', async () => {
    const { setDraft, clearDraft, getDraft } = await load();
    setDraft('2026-10-11', 'Good week');
    setDraft('2026-10-18', 'Tired');
    clearDraft('2026-10-11');
    expect(getDraft('2026-10-11')).toBe('');
    expect(stored()).toEqual({ '2026-10-18': { text: 'Tired', schemaVersion: 1 } });
  });

  it('a failed write keeps the draft in memory and warns, without throwing', async () => {
    const { setDraft, getDraft } = await load();
    const failure = new DOMException('quota exceeded (simulated)', 'QuotaExceededError');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw failure;
    });

    expect(() => setDraft('2026-10-11', 'Good week')).not.toThrow();

    expect(getDraft('2026-10-11')).toBe('Good week');
    expect(warnCall('reviewDraftStore: draft could not be stored')?.[1]).toBe(failure);
  });

  it('drafts survive a reload (fresh module load)', async () => {
    const first = await load();
    first.setDraft('2026-10-11', 'Good week');

    vi.resetModules();
    const reloaded = await load();
    expect(reloaded.getDraft('2026-10-11')).toBe('Good week');
    expect(warn).not.toHaveBeenCalled();
  });
});
