// Story 3.1 -- History & Trends Day List: regression coverage for every I/O
// matrix row, plus the `planStore.status` loading/error branches (review
// pass 1, bad_spec) and a multi-date render guarding row order and
// cross-row independence (Review Triage Log, low/patch carried forward).
//
// Uses the real, unmodified `getDayView`/`getPlanDayRange`/`DayRowCard` (no
// mocking of those collaborators) -- only `getTodayIso` is mocked to a fixed
// date, mirroring `DayRowCard.test.ts`'s own convention. `planStore.plan`/
// `planStore.status` are written to directly, the same module-level `$state`
// object `App.svelte` itself reads (no separate mock store) -- each test sets
// its own Plan shape before rendering, so tests never depend on ordering
// against each other for `planStore`'s value; LogEntry writes (`setCompleted`)
// each use their own date, mirroring `DayRowCard.test.ts`'s convention, since
// `logStore` is a real module-level singleton with no reset between tests in
// this file.
//
// Every workout date here is a realistic near date relative to `FIXED_TODAY`
// -- this file's own Implementation Notes precedent documents that an
// unrealistic far-future fixture (e.g. `2099-01-01`) makes `getPlanDayRange`
// generate tens of thousands of rows and time out `render()`; a real training
// plan's span is always small.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { flushSync } from 'svelte';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import HistoryView from './HistoryView.svelte';
import { planStore } from '../data/planStore.svelte';
import * as planStoreModule from '../data/planStore.svelte';
import { setCompleted } from '../data/logStore.svelte';
import { weekEndReviewStore, type WeekEndReview } from '../data/weekEndReviewStore.svelte';
import type { Workout } from '../domain/parsePlan';

const FIXED_TODAY = '2026-09-25';

vi.mock('../domain/date', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../domain/date')>();
  return { ...actual, getTodayIso: () => FIXED_TODAY };
});

afterEach(() => {
  cleanup();
});

/** Sets `planStore` to a `'loaded'` Plan built only from `workouts` --
 * mirrors what a real fetch resolves into (`planStore.plan` holding a
 * `{ workouts: [...] }`-shaped value), overwriting whatever a previous test
 * left there. */
function setLoadedPlan(workouts: Workout[]) {
  planStore.plan = { workouts };
  planStore.status = 'loaded';
}

function rowFor(container: HTMLElement, date: string) {
  return container.querySelector<HTMLElement>(`[data-date="${date}"]`);
}

describe('HistoryView -- I/O matrix', () => {
  it('past logged day, complete: shows the type/duration/distance summary, no Missed styling', () => {
    const date = '2026-09-10';
    const workout: Workout = { date, type: 'Run', duration: '30 min', distance: '5 km' };
    setCompleted(date, true, workout);
    setLoadedPlan([workout]);

    const { container } = render(HistoryView, { props: { onOpen: vi.fn(), onOpenReview: vi.fn() } });
    const row = rowFor(container, date);

    expect(row).not.toBeNull();
    expect(row).not.toHaveClass('missed');
    expect(row?.textContent).toContain('Run');
    expect(row?.textContent).toContain('30 min · 5 km');
  });

  it('past logged day, incomplete: shows the same Missed chip/label Story 2.4 already renders', () => {
    const date = '2026-09-11';
    const workout: Workout = { date, type: 'Bike', duration: '45 min' };
    setCompleted(date, false, workout);
    setLoadedPlan([workout]);

    const { container } = render(HistoryView, { props: { onOpen: vi.fn(), onOpenReview: vi.fn() } });
    const row = rowFor(container, date);

    expect(row).toHaveClass('missed');
    expect(row?.querySelector('.chip')).toHaveClass('chip-missed');
    expect(row?.textContent).toContain('Missed');
    expect(row?.textContent).toContain('missed — no log entry');
  });

  it('past day, no log, workout elapsed: shows the Missed chip/label', () => {
    const date = '2026-09-12';
    const workout: Workout = { date, type: 'Lift', duration: '20 min' };
    setLoadedPlan([workout]);

    const { container } = render(HistoryView, { props: { onOpen: vi.fn(), onOpenReview: vi.fn() } });
    const row = rowFor(container, date);

    expect(row).toHaveClass('missed');
    expect(row?.querySelector('.chip')).toHaveClass('chip-missed');
    expect(row?.textContent).toContain('Missed');
  });

  it('future day: shows the planned Workout summary only, no log-entry meta, never Missed', () => {
    const date = '2026-09-27'; // 2 days after FIXED_TODAY -- realistic near-future
    const workout: Workout = { date, type: 'Run', duration: '40 min', distance: '8 km' };
    setLoadedPlan([workout]);

    const { container } = render(HistoryView, { props: { onOpen: vi.fn(), onOpenReview: vi.fn() } });
    const row = rowFor(container, date);

    expect(row).not.toBeNull();
    expect(row).not.toHaveClass('missed');
    expect(row?.textContent).toContain('Run');
    expect(row?.textContent).toContain('40 min · 8 km');
    expect(row?.textContent).not.toContain('missed — no log entry');
  });

  it('orphaned log (no workout): renders via the existing orphaned-log handling, never shown as Missed', () => {
    const before: Workout = { date: '2026-09-13', type: 'Run', duration: '30 min' };
    const orphanDate = '2026-09-14'; // inside the Plan span, no Workout scheduled that day
    const after: Workout = { date: '2026-09-15', type: 'Bike', duration: '40 min' };
    setCompleted(orphanDate, false); // no `workout` arg -- a real orphaned-log write
    setLoadedPlan([before, after]);

    const { container } = render(HistoryView, { props: { onOpen: vi.fn(), onOpenReview: vi.fn() } });
    const row = rowFor(container, orphanDate);

    expect(row).not.toBeNull();
    expect(row).not.toHaveClass('missed');
    expect(row?.querySelector('.chip')).not.toHaveClass('chip-missed');
    expect(row?.textContent).not.toContain('Missed');
  });

  it('tap any row: opens Workout Detail via the onOpen prop, identical to Home', async () => {
    const date = '2026-09-16';
    const workout: Workout = { date, type: 'Run', duration: '10 min' };
    setLoadedPlan([workout]);
    const onOpen = vi.fn();

    const { container } = render(HistoryView, { props: { onOpen, onOpenReview: vi.fn() } });
    const row = rowFor(container, date);
    expect(row).not.toBeNull();

    await fireEvent.click(row as HTMLElement);

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(date);
  });

  it("tap a Sunday row whose week already has a saved Week-End Review: routes to onOpenReview instead of onOpen (Story 3.3 review fix -- this branch was never previously exercised by a real click)", async () => {
    const sunday = '2026-09-13'; // a real Sunday, elapsed relative to FIXED_TODAY
    const workout: Workout = { date: sunday, type: 'Run', duration: '20 min' };
    setLoadedPlan([workout]);
    const savedReview: WeekEndReview = {
      weekStartIso: sunday,
      workoutsCompleted: 1,
      byType: { Run: 1, Bike: 0, Lift: 0, Mobility: 0, Stretch: 0, Other: 0, Unspecified: 0 },
      streak: 1,
      missedCount: 0,
      reflection: 'Good week.',
      schemaVersion: 1,
    };
    weekEndReviewStore.reviews[sunday] = savedReview;
    const onOpen = vi.fn();
    const onOpenReview = vi.fn();

    const { container } = render(HistoryView, { props: { onOpen, onOpenReview } });
    const row = rowFor(container, sunday);
    expect(row).not.toBeNull();

    await fireEvent.click(row as HTMLElement);

    expect(onOpenReview).toHaveBeenCalledTimes(1);
    expect(onOpenReview).toHaveBeenCalledWith(sunday);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('tap a Sunday row whose week has NOT been saved yet: still routes to onOpen, same as any other row', async () => {
    const sunday = '2026-09-06'; // a different real Sunday, no saved review for it
    const workout: Workout = { date: sunday, type: 'Run', duration: '20 min' };
    setLoadedPlan([workout]);
    const onOpen = vi.fn();
    const onOpenReview = vi.fn();

    const { container } = render(HistoryView, { props: { onOpen, onOpenReview } });
    const row = rowFor(container, sunday);
    expect(row).not.toBeNull();

    await fireEvent.click(row as HTMLElement);

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(sunday);
    expect(onOpenReview).not.toHaveBeenCalled();
  });

  it('empty Plan: renders exactly one row (today, rest-day treatment), no History-specific empty-state copy', () => {
    setLoadedPlan([]);

    const { container } = render(HistoryView, { props: { onOpen: vi.fn(), onOpenReview: vi.fn() } });
    const rows = container.querySelectorAll('[data-date]');

    expect(rows).toHaveLength(1);
    expect(rows[0].getAttribute('data-date')).toBe(FIXED_TODAY);
    expect(rows[0]).not.toHaveClass('missed');
    expect(rows[0].textContent).toContain('Rest Day');
    expect(rows[0].textContent).toContain('Today');
  });
});

describe('HistoryView -- planStore.status branches (review pass 1, bad_spec)', () => {
  it("planStore.status === 'loading': shows the same loading skeleton Home shows, no day rows", () => {
    planStore.plan = null;
    planStore.status = 'loading';

    const { container } = render(HistoryView, { props: { onOpen: vi.fn(), onOpenReview: vi.fn() } });

    expect(container.querySelectorAll('[data-date]')).toHaveLength(0);
    expect(container.querySelectorAll('.skeleton-day-row')).toHaveLength(5);
    expect(container.textContent).toContain('Loading your plan');
  });

  it("planStore.status === 'error': shows the same retry-error feedback Home shows, no day rows, and tapping Retry invokes loadPlan", async () => {
    planStore.plan = null;
    planStore.status = 'error';
    const loadPlanSpy = vi.spyOn(planStoreModule, 'loadPlan').mockImplementation(() => Promise.resolve());

    const { container, getByRole } = render(HistoryView, { props: { onOpen: vi.fn(), onOpenReview: vi.fn() } });

    expect(container.querySelectorAll('[data-date]')).toHaveLength(0);
    expect(getByRole('alert')).toBeTruthy();
    const retryButton = getByRole('button', { name: 'Retry' });
    expect(retryButton).toBeTruthy();

    await fireEvent.click(retryButton);
    expect(loadPlanSpy).toHaveBeenCalledTimes(1);

    loadPlanSpy.mockRestore();
  });
});

describe('HistoryView -- multi-date render (row order, cross-row independence)', () => {
  it('renders several dates with mixed states, in chronological order, each independently', () => {
    const loggedComplete: Workout = { date: '2026-08-01', type: 'Run', duration: '30 min', distance: '5 km' };
    const missed: Workout = { date: '2026-08-03', type: 'Bike', duration: '45 min' };
    const futurePlanned: Workout = { date: '2026-09-28', type: 'Lift', duration: '20 min' };
    setCompleted(loggedComplete.date, true, loggedComplete);
    // `missed.date` deliberately left with no LogEntry.
    setLoadedPlan([loggedComplete, missed, futurePlanned]);

    const { container } = render(HistoryView, { props: { onOpen: vi.fn(), onOpenReview: vi.fn() } });

    const dates = Array.from(container.querySelectorAll('[data-date]')).map((el) =>
      el.getAttribute('data-date'),
    );
    // Chronological order, exactly as `getPlanDayRange`'s own day-by-day loop
    // produces -- every date from the earliest workout through the latest,
    // including today.
    expect(dates[0]).toBe(loggedComplete.date);
    expect(dates).toContain(missed.date);
    expect(dates).toContain(FIXED_TODAY);
    expect(dates[dates.length - 1]).toBe(futurePlanned.date);
    expect(dates.indexOf(loggedComplete.date)).toBeLessThan(dates.indexOf(missed.date));
    expect(dates.indexOf(missed.date)).toBeLessThan(dates.indexOf(futurePlanned.date));

    // Cross-row independence: each row reflects only its own state, not a
    // neighbor's.
    const completeRow = rowFor(container, loggedComplete.date);
    expect(completeRow).not.toHaveClass('missed');
    expect(completeRow?.textContent).toContain('30 min · 5 km');

    const missedRow = rowFor(container, missed.date);
    expect(missedRow).toHaveClass('missed');
    expect(missedRow?.textContent).toContain('Missed');

    const futureRow = rowFor(container, futurePlanned.date);
    expect(futureRow).not.toHaveClass('missed');
    expect(futureRow?.textContent).toContain('Lift');
    expect(futureRow?.textContent).toContain('20 min');
  });
});

describe('HistoryView -- reactivity to planStore changes after mount', () => {
  it('a status transition to \'loaded\' and a later background Plan update both re-render the SAME mounted instance in place, no remount', () => {
    const date = '2026-09-05';
    planStore.plan = null;
    planStore.status = 'loading';

    const { container } = render(HistoryView, { props: { onOpen: vi.fn(), onOpenReview: vi.fn() } });
    expect(container.querySelectorAll('.skeleton-day-row')).toHaveLength(5);
    expect(container.querySelectorAll('[data-date]')).toHaveLength(0);

    // `'loading'` -> `'loaded'`, mirroring a cold fetch resolving while this
    // same HistoryView instance stays mounted (App.svelte never remounts
    // either panel on a status change -- Boundaries: "always-both-panels-
    // mounted convention").
    const workout: Workout = { date, type: 'Run', duration: '15 min' };
    flushSync(() => {
      planStore.plan = { workouts: [workout] };
      planStore.status = 'loaded';
    });

    expect(container.querySelectorAll('.skeleton-day-row')).toHaveLength(0);
    const row = rowFor(container, date);
    expect(row).not.toBeNull();
    expect(row?.textContent).toContain('Run');

    // Background refetch while already `'loaded'` (AD-5's "no visible
    // interruption"): `planStore.plan` changes again with no status flip.
    // The exact same DOM node updates in place -- the actual mechanism this
    // asserts, mirroring `DayRowCard.test.ts`'s own live-update convention --
    // not just "a freshly-rendered instance reads current state."
    const updatedWorkout: Workout = { date, type: 'Bike', duration: '25 min' };
    flushSync(() => {
      planStore.plan = { workouts: [updatedWorkout] };
    });

    const updatedRow = rowFor(container, date);
    expect(updatedRow).toBe(row);
    expect(updatedRow?.textContent).toContain('Bike');
    expect(updatedRow?.textContent).not.toContain('Run');
  });
});

describe('HistoryView -- Rollups & Trend Chart wiring (Story 3.2)', () => {
  it('mounts TrendChart/RollupSummary above the day list and reflects a real logStore.entries write, not just a source-text check', () => {
    // 'Mobility' is a sentinel type no other test in this file writes, so its
    // rendered count can only have come from this test's own write to the
    // real (module-level, unreset-between-tests) logStore -- proving
    // HistoryView actually reads `logStore.entries` and forwards it down,
    // not a mocked/stubbed prop.
    const date = FIXED_TODAY;
    const workout: Workout = { date, type: 'Mobility', duration: '20 min' };
    setCompleted(date, true, workout);
    setLoadedPlan([workout]);

    const { container } = render(HistoryView, { props: { onOpen: vi.fn(), onOpenReview: vi.fn() } });

    // TrendChart: real Log Entries exist, so the zero-state copy is gone and
    // at least one real bar renders (the current week's, containing `date`).
    expect(
      container.textContent,
    ).not.toContain("Your trends will show up here once you've logged a few workouts");
    expect(container.querySelectorAll('.trend-bar').length).toBeGreaterThan(0);

    // RollupSummary: month-to-date's "Mobility" row reflects the write.
    const monthSection = Array.from(container.querySelectorAll('section')).find(
      (el) => el.getAttribute('aria-label') === 'Month to date',
    );
    const mobilityItem = Array.from(monthSection?.querySelectorAll('.rollup-item') ?? []).find(
      (el) => el.querySelector('.rollup-type-label')?.textContent === 'Mobility',
    );
    expect(mobilityItem?.querySelector('.rollup-stat-value')?.textContent).toBe('1');

    // Mount order: TrendChart and RollupSummary both precede the day list.
    const trendEl = container.querySelector('.trend-chart');
    const rollupEl = container.querySelector('.rollup-summary');
    const historyListEl = container.querySelector('.history-list');
    expect(trendEl).not.toBeNull();
    expect(rollupEl).not.toBeNull();
    expect(historyListEl).not.toBeNull();
    expect(
      trendEl!.compareDocumentPosition(rollupEl!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      rollupEl!.compareDocumentPosition(historyListEl!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
