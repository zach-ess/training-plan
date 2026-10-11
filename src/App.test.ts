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

// Story 4.4 -- week headers on Home: before each plan week's first day only,
// never before a day outside every plan week, and not at all for a flat plan.
describe('App -- week headers on Home (Story 4.4)', () => {
  function nextRowDate(header: Element): string | null {
    return header.nextElementSibling?.getAttribute('data-date') ?? null;
  }

  it("places each header before its week's first rendered day, even when the week starts on an unrendered rest Monday", async () => {
    // Coach weeks start on a rest-only Monday. Week 1 starts Sep 28, before
    // both the first workout (Oct 1) and today (Oct 6), so Sep 28 is not in
    // the day list -- its header must move to Oct 1, the first rendered day.
    planStore.plan = {
      workouts: WORKOUTS,
      weeks: [
        { weekNumber: 1, startDate: '2026-09-28', endDate: '2026-10-04', phase: 'Return', days: [] },
        { weekNumber: 2, startDate: '2026-10-05', endDate: '2026-10-11', phase: 'Return', days: [] },
      ],
    };
    const { container } = await renderApp();
    const list = container.querySelector('#panel-home .day-list')!;
    const headers = Array.from(list.querySelectorAll('.week-header'));

    expect(headers.map((h) => nextRowDate(h))).toEqual(['2026-10-01', '2026-10-05']);
    expect(headers[0]).toHaveTextContent('Week 1 · Sep 28–Oct 4 · Return');
    expect(list.firstElementChild).toBe(headers[0]);
  });

  it('days before the first plan week carry no header', async () => {
    planStore.plan = {
      workouts: WORKOUTS,
      weeks: [{ weekNumber: 1, startDate: '2026-10-05', endDate: '2026-10-11', phase: 'Return', days: [] }],
    };
    const { container } = await renderApp();
    const list = container.querySelector('#panel-home .day-list')!;
    expect(list.firstElementChild?.getAttribute('data-date')).toBe('2026-10-01');
    expect(nextRowDate(list.querySelector('.week-header')!)).toBe('2026-10-05');
  });

  it('a flat plan renders dated rows and no headers', async () => {
    const { container } = await renderApp();
    expect(container.querySelectorAll('#panel-home .week-header')).toHaveLength(0);
    expect(container.querySelector(`#panel-home [data-date="${FIXED_TODAY}"] .weekday`)?.textContent).toBe('TUE · Oct 6');
  });
});

/** Records, for every `focus()` call, whether the target sat inside an
 * inert subtree at that moment -- a real browser silently refuses such
 * a focus, but jsdom doesn't enforce `inert`, so asserting
 * `document.activeElement` alone can't catch focusing too early. */
function trackFocusInert() {
  const calls: { el: HTMLElement; inert: boolean }[] = [];
  const original = HTMLElement.prototype.focus;
  vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (this: HTMLElement, options?: FocusOptions) {
    // jsdom has no native `inert`, so Svelte sets it as a plain property
    // rather than an attribute -- walk the ancestors and read that.
    let node: HTMLElement | null = this;
    let inert = false;
    while (node) {
      if ((node as HTMLElement & { inert?: boolean }).inert === true) {
        inert = true;
        break;
      }
      node = node.parentElement;
    }
    calls.push({ el: this, inert });
    return original.call(this, options);
  });
  return calls;
}

// Story 4.3 -- a Sunday row opens WorkoutDetail (never the Review directly),
// and the Sunday's Review is reached from Detail: Detail closes, the Review
// opens (editable while unsaved, read-only once saved), and closing the
// Review returns focus to that Sunday's row.
describe('App -- Week-End Review from a Sunday (Story 4.3)', () => {
  afterEach(async () => {
    const { weekEndReviewStore } = await import('./lib/data/weekEndReviewStore.svelte');
    delete weekEndReviewStore.reviews['2026-10-04'];
  });

  it('past unsaved Sunday: row -> Detail -> "Review this week" -> editable Review; closing returns focus to the row', async () => {
    const { container } = await renderApp();
    const sundayRow = container.querySelector<HTMLElement>('#panel-home [data-date="2026-10-04"]')!;
    const focusCalls = trackFocusInert();

    await fireEvent.click(sundayRow);
    await tick();
    await fireEvent.click(screen.getByRole('button', { name: 'Review this week' }));
    await tick();

    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();

    await fireEvent.keyDown(window, { key: 'Escape' });
    await tick();
    await tick();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(sundayRow);
    // Focus was applied after the panels stopped being inert.
    expect(focusCalls.filter((c) => c.el === sundayRow).map((c) => c.inert)).toEqual([false]);
  });

  it('from the History tab: Sunday row -> Detail -> Review; closing returns focus to the History row, not Home\x27s copy', async () => {
    const { container } = await renderApp();
    await tapTab(/history/i);
    const historyRow = container.querySelector<HTMLElement>('#panel-history [data-date="2026-10-04"]')!;

    await fireEvent.click(historyRow);
    await tick();
    await fireEvent.click(screen.getByRole('button', { name: 'Review this week' }));
    await tick();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();

    await fireEvent.keyDown(window, { key: 'Escape' });
    await tick();
    await tick();
    expect(document.activeElement).toBe(historyRow);
  });

  it('a saved Sunday row opens Detail (so its run stays loggable), which opens the read-only Review', async () => {
    const { weekEndReviewStore } = await import('./lib/data/weekEndReviewStore.svelte');
    weekEndReviewStore.reviews['2026-10-04'] = {
      weekStartIso: '2026-10-04',
      workoutsCompleted: 1,
      byType: { Run: 1, Bike: 0, Lift: 0, Mobility: 0, Stretch: 0, Other: 0, Unspecified: 0 },
      streak: 1,
      missedCount: 0,
      reflection: 'Fine week.',
      schemaVersion: 1,
    };
    const { container } = await renderApp();

    await fireEvent.click(container.querySelector<HTMLElement>('#panel-home [data-date="2026-10-04"]')!);
    await tick();
    // Workout Detail opened (its Back button and title), not the Review.
    expect(screen.getByRole('button', { name: '← Back' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Rest Day' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();

    await fireEvent.click(screen.getByRole('button', { name: "View this week's review" }));
    await tick();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.getByRole('dialog')).toHaveTextContent('Fine week.');
  });
});

// Fix (2026-10-11, deferred from Story 4.3): closing Workout Detail returns
// focus to the tapped row only after the panels stop being inert, so a real
// browser accepts it (jsdom alone would accept it either way).
describe('App -- Workout Detail close returns focus to the row', () => {
  for (const [how, close] of [
    ['Escape', () => fireEvent.keyDown(window, { key: 'Escape' })],
    ['Back', () => fireEvent.click(screen.getByRole('button', { name: '← Back' }))],
    ['scrim tap', () => fireEvent.click(document.querySelector('.scrim') as HTMLElement)],
  ] as const) {
    it(`closing by ${how} focuses the tapped row once it is no longer inert`, async () => {
      const { container } = await renderApp();
      // A weekday row (Thu Oct 1), so Sunday's review action plays no part.
      const row = container.querySelector<HTMLElement>('#panel-home [data-date="2026-10-01"]')!;
      const focusCalls = trackFocusInert();

      await fireEvent.click(row);
      await tick();
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      await close();
      await tick();
      await tick();

      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.activeElement).toBe(row);
      expect(focusCalls.filter((c) => c.el === row).map((c) => c.inert)).toEqual([false]);
    });
  }

  it('from the History tab, closing returns focus to the History row (not Home\x27s copy)', async () => {
    const { container } = await renderApp();
    await tapTab(/history/i);
    const row = container.querySelector<HTMLElement>('#panel-history [data-date="2026-10-01"]')!;
    const focusCalls = trackFocusInert();

    await fireEvent.click(row);
    await tick();
    await fireEvent.keyDown(window, { key: 'Escape' });
    await tick();
    await tick();

    expect(document.activeElement).toBe(row);
    expect(focusCalls.filter((c) => c.el === row).map((c) => c.inert)).toEqual([false]);
  });
});
