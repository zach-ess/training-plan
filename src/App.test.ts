// Story 4.2 -- Tap the Active Tab to Reset Its View: renders the real
// `App.svelte` (its first test file -- see deferred-work.md's "App.svelte has
// no dedicated test file") and checks that re-tapping the active tab resets
// that tab's scroll, that tapping the other tab does not, and that an open
// dialog closes first. jsdom implements no scrolling at all, so
// `scrollIntoView`/`scrollTo` are stubbed and asserted on as calls.
// `getTodayIso` is mocked to a fixed date, mirroring `HistoryView.test.ts`.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import App from './App.svelte';
import { planStore } from './lib/data/planStore.svelte';
import type { Workout } from './lib/domain/parsePlan';

const FIXED_TODAY = '2026-10-06';

vi.mock('./lib/domain/date', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/domain/date')>();
  return { ...actual, getTodayIso: () => FIXED_TODAY };
});

const WORKOUTS: Workout[] = [
  { date: '2026-10-01', type: 'Run', duration: '20 min' },
  { date: FIXED_TODAY, type: 'Run', duration: '40 min' },
  { date: '2026-10-11', type: 'Run', duration: '40 min' },
];

let scrollIntoView: ReturnType<typeof vi.fn>;
let elementScrollTo: ReturnType<typeof vi.fn>;
let windowScrollTo: ReturnType<typeof vi.fn>;
const originalMatchMedia = window.matchMedia;
const originalScrollIntoView = Element.prototype.scrollIntoView;
const originalElementScrollTo = Element.prototype.scrollTo;
const originalWindowScrollTo = window.scrollTo;

beforeEach(() => {
  scrollIntoView = vi.fn();
  elementScrollTo = vi.fn();
  windowScrollTo = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView as unknown as Element['scrollIntoView'];
  Element.prototype.scrollTo = elementScrollTo as unknown as Element['scrollTo'];
  window.scrollTo = windowScrollTo as unknown as typeof window.scrollTo;
  // App's mount effect runs a background `loadPlan()`; keep it off the
  // network and quiet (Story 4.1 warns on the failed refetch).
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  planStore.plan = { workouts: WORKOUTS };
  planStore.status = 'loaded';
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.matchMedia = originalMatchMedia;
  Element.prototype.scrollIntoView = originalScrollIntoView;
  Element.prototype.scrollTo = originalElementScrollTo;
  window.scrollTo = originalWindowScrollTo;
});

/** Overrides the setup file's always-matching `matchMedia` so
 * `prefers-reduced-motion` reads as off. */
function motionAllowed() {
  window.matchMedia = vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

async function renderApp() {
  const result = render(App);
  await tick();
  // Discard the first-open `scrollToToday` call so each test sees only
  // what its own tab tap caused.
  scrollIntoView.mockClear();
  return result;
}

async function tapTab(name: RegExp) {
  await fireEvent.click(screen.getByRole('tab', { name }));
  await tick();
  await tick();
}

describe('App -- tap the active tab to reset its view', () => {
  it('re-tapping Home scrolls today back into view, centered, animated when motion is allowed', async () => {
    motionAllowed();
    await renderApp();

    await tapTab(/home/i);

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });
    expect(scrollIntoView.mock.contexts[0]).toHaveAttribute('data-date', FIXED_TODAY);
  });

  it('jumps instead of animating under prefers-reduced-motion', async () => {
    // vitest.setup.ts's matchMedia mock matches every query, including
    // `(prefers-reduced-motion: reduce)`.
    await renderApp();

    await tapTab(/home/i);

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'auto' });
  });

  it('re-tapping History scrolls both the page and its day list back to the top', async () => {
    motionAllowed();
    const { container } = await renderApp();
    await tapTab(/history/i);
    expect(windowScrollTo).not.toHaveBeenCalled();

    await tapTab(/history/i);

    expect(windowScrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    expect(elementScrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    expect(elementScrollTo.mock.contexts[0]).toBe(container.querySelector('#panel-history .history-list'));
  });

  it('re-tapping History under prefers-reduced-motion jumps both scrolls', async () => {
    await renderApp();
    await tapTab(/history/i);

    await tapTab(/history/i);

    expect(windowScrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
    expect(elementScrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
  });

  it('tapping the other tab switches without resetting any scroll', async () => {
    const { container } = await renderApp();

    await tapTab(/history/i);
    expect(container.querySelector('#panel-history')).not.toHaveAttribute('hidden');
    expect(container.querySelector('#panel-home')).toHaveAttribute('hidden');
    await tapTab(/home/i);
    expect(container.querySelector('#panel-home')).not.toHaveAttribute('hidden');

    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(windowScrollTo).not.toHaveBeenCalled();
    expect(elementScrollTo).not.toHaveBeenCalled();
  });

  it('re-tapping Home with Workout Detail open closes the dialog, then resets', async () => {
    const { container } = await renderApp();
    const row = container.querySelector<HTMLElement>(`#panel-home [data-date="2026-10-11"]`);
    await fireEvent.click(row!);
    await tick();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await tapTab(/home/i);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toHaveAttribute('data-date', FIXED_TODAY);
  });

  it('re-tapping History with Workout Detail open (from a History row) closes it, then resets', async () => {
    const { container } = await renderApp();
    await tapTab(/history/i);
    const row = container.querySelector<HTMLElement>(`#panel-history [data-date="2026-10-01"]`);
    await fireEvent.click(row!);
    await tick();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await tapTab(/history/i);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(windowScrollTo).toHaveBeenCalledTimes(1);
    expect(elementScrollTo).toHaveBeenCalledTimes(1);
  });
});
