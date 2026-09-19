// Story 1.4 -- Plan Data Store (Architecture's Data Store layer, AD-5).
//
// Owns the app-level Plan state and the fetch/cache/loading-state flow Home
// (App.svelte) reads from. The Plan's own JSON shape is opaque here -- only
// "did the fetch/parse succeed" is checked (Design Notes); Story 1.5 is
// expected to read `planStore.plan` and do its own shape-specific work.
//
// Cache Storage (the `caches` global), not IndexedDB or localStorage, is the
// only storage used for the Plan cache (Never section, AD-1/AD-3) --
// localStorage stays reserved for LogEntry/WeekEndReview data.

export type PlanStatus = 'loading' | 'loaded' | 'error';

interface PlanStoreState {
  status: PlanStatus;
  plan: unknown | null;
}

// This story's own Cache Storage entry -- distinct from the browser HTTP
// cache and from the service worker's Workbox precache (vite.config.ts no
// longer precaches plan.json; see that file's comment).
const CACHE_NAME = 'plan-cache-v1';

// The un-busted URL: what gets read on a cold cache-check and what the
// successful-fetch response is written back under, so the *next* cold
// cache-read finds it.
const PLAN_URL = `${import.meta.env.BASE_URL}plan.json`;

// Without a timeout, a stalled connection (a captive wifi portal, a dead
// proxy) never resolves or rejects `fetch` at all -- Home would sit on the
// skeleton state forever with no error and no Retry ever surfacing, which is
// exactly the "never leaves me staring at a spinner or a blank screen"
// failure this story exists to prevent. 10s is generous for a same-origin
// static JSON file while still bounding the worst case to something a user
// will actually wait out before giving up on their own.
const FETCH_TIMEOUT_MS = 10_000;

export const planStore: PlanStoreState = $state({
  status: 'loading',
  plan: null,
});

// True while a `loadPlan()` call is already in progress. This is the actual
// reentrancy guard for this module (a fresh-session review found that no
// such guard previously existed here at all, despite comments elsewhere
// claiming one did) -- it prevents two overlapping calls (e.g. the mount
// effect and a Retry tap landing close together, or two Retry taps) from
// racing to write `planStore.plan`/`status` independently, where whichever
// happened to resolve last would silently win regardless of which one
// actually started (or fetched fresher data) first.
let fetchInFlight = false;

/**
 * Reads any existing cached Plan for an instant paint, then always issues a
 * genuine network fetch against a cache-busted URL so the service worker's
 * own routing can never intercept it and silently hand back a stale
 * precached response (Never section).
 *
 * Safe to call again (e.g. from the failure state's Retry button) -- a call
 * while not already `'loaded'` resumes the `'loading'` (skeleton) state and
 * re-runs this same flow, so Retry's outcome is handled identically to the
 * original attempt. A call that arrives while another is still in flight is
 * a silent no-op (see `fetchInFlight` above) rather than a second concurrent
 * attempt.
 */
export async function loadPlan(): Promise<void> {
  if (fetchInFlight) {
    return;
  }
  fetchInFlight = true;
  try {
    await loadPlanUnguarded();
  } finally {
    fetchInFlight = false;
  }
}

async function loadPlanUnguarded(): Promise<void> {
  // A retry after a cold-start failure needs the skeleton back; a call while
  // already `'loaded'` (the background refetch on every open) must not flash
  // it away and back per AD-5's "no visible interruption".
  if (planStore.status !== 'loaded') {
    planStore.status = 'loading';
  }

  let cacheHit = planStore.status === 'loaded';

  if (!cacheHit) {
    try {
      const cache = await caches.open(CACHE_NAME);
      const cachedResponse = await cache.match(PLAN_URL);
      if (cachedResponse) {
        const cachedPlan = await cachedResponse.json();
        planStore.plan = cachedPlan;
        planStore.status = 'loaded';
        cacheHit = true;
      }
    } catch {
      // Cache Storage unsupported/unavailable, or the cached entry was
      // corrupt/unreadable -- fall through to the network fetch below. A
      // missing or bad cache entry is not itself a failure condition.
    }
  }

  try {
    // Cache-busted so this fetch can never be served from the service
    // worker's precache/runtime routing for the exact plan.json URL (see
    // this story's Never section) -- a same-session freshness check needs a
    // genuine network round-trip, not a precache hit.
    const bustedUrl = `${PLAN_URL}?_=${Date.now()}`;
    // Feature-detected rather than called unconditionally: on a browser
    // without `AbortSignal.timeout` (an older engine an installed PWA could
    // still be running on years into this app's life), calling it throws
    // synchronously inside this same try -- and since that throw would
    // recur on every future call too, it would permanently pin `status` to
    // `'error'` with no way for even a Retry tap to ever succeed again. A
    // browser new enough to install this PWA is expected to have it, so
    // this is a defensive fallback, not the common case.
    const fetchOptions: RequestInit =
      typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
        ? { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
        : {};
    const response = await fetch(bustedUrl, fetchOptions);
    if (!response.ok) {
      throw new Error(`plan.json fetch failed with status ${response.status}`);
    }

    // Read the parsed body from a clone so the original response, still
    // unread, can be written into the cache as-is below.
    const parsed = await response.clone().json();

    planStore.plan = parsed;
    planStore.status = 'loaded';

    try {
      const cache = await caches.open(CACHE_NAME);
      // Keyed by the un-busted URL, not `bustedUrl`, so the next cold
      // cache-read (above) finds it.
      await cache.put(PLAN_URL, response);
    } catch {
      // Non-fatal: the in-memory Plan is already updated; persisting it for
      // the next cold start/offline reopen is best-effort only.
    }
  } catch {
    // AD-5: a background refetch failure is swallowed silently, leaving an
    // already-`'loaded'` Plan/state exactly as-is -- no error banner. Only a
    // cold start with nothing ever cached (still `'loading'` here) surfaces
    // the failure state.
    if (planStore.status === 'loading') {
      planStore.status = 'error';
    }
  }
}
