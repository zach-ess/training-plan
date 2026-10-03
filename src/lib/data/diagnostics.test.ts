// Story 4.1 -- Console Diagnostics for Caught Failures: every Data Store path
// that catches and drops a failure without on-screen UI leaves a
// `console.warn` (message prefix plus the error or offending key/value), and
// nothing else about its behavior changes. Each store is a module-level
// singleton initialized at import time, so every test resets the module
// registry and imports a fresh copy after arranging its storage.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

/** The first `console.warn` call whose message starts with `prefix`, or
 * undefined -- so a test can assert on the extra arguments too. */
function warnCall(prefix: string): unknown[] | undefined {
  return warn.mock.calls.find((call: unknown[]) => typeof call[0] === 'string' && call[0].startsWith(prefix));
}

const LOG_KEY = 'log-entries-v1';
const REVIEW_KEY = 'week-end-reviews-v1';

const VALID_REVIEW = {
  weekStartIso: '2026-10-11',
  workoutsCompleted: 3,
  byType: {},
  streak: 2,
  missedCount: 0,
  reflection: 'Steady week.',
  schemaVersion: 1,
};

describe('logStore startup load', () => {
  it('warns with the error and starts empty when stored entries are unreadable JSON', async () => {
    localStorage.setItem(LOG_KEY, '{not json');
    const { logStore } = await import('./logStore.svelte');
    expect(logStore.entries).toEqual({});
    expect(warnCall('logStore: stored log entries could not be read')?.[1]).toBeInstanceOf(SyntaxError);
  });

  it('warns and starts empty when the stored value is not an object', async () => {
    localStorage.setItem(LOG_KEY, JSON.stringify('oops'));
    const { logStore } = await import('./logStore.svelte');
    expect(logStore.entries).toEqual({});
    expect(warnCall('logStore: stored log entries are not an object')?.[1]).toBe('oops');
  });

  it('warns about and drops only the malformed record (key and value), keeping the valid one', async () => {
    localStorage.setItem(
      LOG_KEY,
      JSON.stringify({
        '2026-10-06': { date: '2026-10-06', completed: true, schemaVersion: 1 },
        '2026-10-08': 'garbage',
      }),
    );
    const { logStore } = await import('./logStore.svelte');
    expect(Object.keys(logStore.entries)).toEqual(['2026-10-06']);
    expect(warnCall('logStore: dropping malformed stored log entry')?.slice(1)).toEqual(['2026-10-08', 'garbage']);
  });

  it('warns when skipping a reserved key', async () => {
    localStorage.setItem(LOG_KEY, '{"constructor": {"completed": true}}');
    const { logStore } = await import('./logStore.svelte');
    expect(Object.keys(logStore.entries)).toEqual([]);
    expect(warnCall('logStore: skipping reserved stored key')?.[1]).toBe('constructor');
  });

  it('stays silent for empty storage and for valid stored entries', async () => {
    await import('./logStore.svelte');
    vi.resetModules();
    localStorage.setItem(LOG_KEY, JSON.stringify({ '2026-10-06': { date: '2026-10-06', completed: true, schemaVersion: 1 } }));
    const { logStore } = await import('./logStore.svelte');
    expect(Object.keys(logStore.entries)).toEqual(['2026-10-06']);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('weekEndReviewStore startup load', () => {
  it('warns with the error and starts empty when stored reviews are unreadable JSON', async () => {
    localStorage.setItem(REVIEW_KEY, '{not json');
    const { weekEndReviewStore } = await import('./weekEndReviewStore.svelte');
    expect(weekEndReviewStore.reviews).toEqual({});
    expect(warnCall('weekEndReviewStore: stored reviews could not be read')?.[1]).toBeInstanceOf(SyntaxError);
  });

  it('warns and starts empty when the stored value is not an object', async () => {
    localStorage.setItem(REVIEW_KEY, JSON.stringify([1, 2, 3]));
    const { weekEndReviewStore } = await import('./weekEndReviewStore.svelte');
    expect(weekEndReviewStore.reviews).toEqual({});
    expect(warnCall('weekEndReviewStore: stored reviews are not an object')).toBeDefined();
  });

  it('warns about and drops a review missing workoutsCompleted, keeping the valid sibling', async () => {
    const { workoutsCompleted: _omitted, ...missingCount } = { ...VALID_REVIEW, weekStartIso: '2026-10-18' };
    localStorage.setItem(REVIEW_KEY, JSON.stringify({ '2026-10-11': VALID_REVIEW, '2026-10-18': missingCount }));
    const { weekEndReviewStore } = await import('./weekEndReviewStore.svelte');
    expect(Object.keys(weekEndReviewStore.reviews)).toEqual(['2026-10-11']);
    expect(warnCall('weekEndReviewStore: dropping malformed stored review')?.[1]).toBe('2026-10-18');
  });

  it('stays silent for valid stored reviews', async () => {
    localStorage.setItem(REVIEW_KEY, JSON.stringify({ '2026-10-11': VALID_REVIEW }));
    const { weekEndReviewStore } = await import('./weekEndReviewStore.svelte');
    expect(Object.keys(weekEndReviewStore.reviews)).toEqual(['2026-10-11']);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('planStore', () => {
  function stubCaches(open: () => Promise<unknown>) {
    vi.stubGlobal('caches', { open: vi.fn(open) });
  }

  function emptyCache() {
    stubCaches(() => Promise.resolve({ match: () => Promise.resolve(undefined), put: () => Promise.resolve() }));
  }

  it('a failed background refetch warns with the error but leaves the loaded Plan showing (AD-5)', async () => {
    const offline = new TypeError('offline');
    const { planStore, loadPlan } = await import('./planStore.svelte');
    planStore.plan = { workouts: [] };
    planStore.status = 'loaded';
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(offline)));

    await loadPlan();

    expect(planStore.status).toBe('loaded');
    expect(warnCall('planStore: plan.json fetch or parse failed')?.[1]).toBe(offline);
  });

  it('a cold-start fetch failure warns and still shows the error state', async () => {
    emptyCache();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))));
    const { planStore, loadPlan } = await import('./planStore.svelte');

    await loadPlan();

    expect(planStore.status).toBe('error');
    expect(warnCall('planStore: plan.json fetch or parse failed')).toBeDefined();
  });

  it('a non-2xx response warns with its status', async () => {
    emptyCache();
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('missing', { status: 404 }))));
    const { loadPlan } = await import('./planStore.svelte');

    await loadPlan();

    expect(String(warnCall('planStore: plan.json fetch or parse failed')?.[1])).toContain('404');
  });

  it('unavailable Cache Storage warns on read and on write, and the fetched Plan still loads', async () => {
    stubCaches(() => Promise.reject(new Error('Cache Storage unavailable')));
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({ workouts: [] }), { status: 200 }))),
    );
    const { planStore, loadPlan } = await import('./planStore.svelte');

    await loadPlan();

    expect(planStore.status).toBe('loaded');
    expect(warnCall('planStore: cached plan.json could not be read')).toBeDefined();
    expect(warnCall('planStore: fetched plan.json could not be cached')).toBeDefined();
  });

  it('stays silent on a cache miss followed by a successful fetch and cache write', async () => {
    emptyCache();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({ workouts: [] }), { status: 200 }))),
    );
    const { planStore, loadPlan } = await import('./planStore.svelte');

    await loadPlan();

    expect(planStore.status).toBe('loaded');
    expect(warn).not.toHaveBeenCalled();
  });
});
