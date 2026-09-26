// Story 3.2 -- Rollups & Trend Chart: regression coverage for TrendChart's
// zero-state/window-trimming/full-window rendering (this spec's I/O matrix).
// `getTodayIso` is mocked to a fixed date, mirroring
// `DayRowCard.test.ts`/`HistoryView.test.ts`'s own convention -- every other
// export of `../domain/date` is passed through unmocked. This component
// takes `entries` as a prop (HistoryView does the one real `logStore.entries`
// read and forwards it down), so these tests build `entries` directly rather
// than going through `logStore.svelte.ts`.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import TrendChart from './TrendChart.svelte';

const FIXED_TODAY = '2026-09-25';

vi.mock('../domain/date', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../domain/date')>();
  return { ...actual, getTodayIso: () => FIXED_TODAY };
});

// Mirrors `DayRowCard.test.ts`/`HistoryView.test.ts`'s own convention: without
// this, multiple renders across tests in this file accumulate in the same
// jsdom document, so a query like `getByText` on a string more than one
// render left behind (e.g. the zero-state copy) throws "multiple elements
// found" instead of asserting against just the test's own render.
afterEach(() => {
  cleanup();
});

describe('TrendChart', () => {
  it('AC3: zero Log Entries anywhere shows the exact "insufficient data" copy, no chart', () => {
    const { getByText, container } = render(TrendChart, { props: { entries: {} } });

    expect(
      getByText("Your trends will show up here once you've logged a few workouts"),
    ).toBeTruthy();
    expect(container.querySelectorAll('.trend-bar')).toHaveLength(0);
  });

  it('a user whose only Log Entries are all completed: false (mark complete, then mark incomplete again) still sees the zero-state copy, never an all-zero/flat chart', () => {
    const entries: Record<string, unknown> = {
      '2026-09-10': { type: 'Run', completed: false },
      '2026-09-17': { type: 'Bike', completed: false },
    };

    const { getByText, container } = render(TrendChart, { props: { entries } });

    expect(
      getByText("Your trends will show up here once you've logged a few workouts"),
    ).toBeTruthy();
    expect(container.querySelectorAll('.trend-bar')).toHaveLength(0);
  });

  it('AC5: entries spanning the full 12-week window render exactly one accent-primary bar per week, each bar height proportional to its own week\'s count', () => {
    // One entry per week across the whole window, including the oldest week
    // -- except the oldest week gets a *second* entry, so its count (2) is
    // double every other week's count (1), giving a known, checkable
    // height ratio (the oldest bar at 100%, every other bar at 50%).
    const oldestWeekStart = new Date(2026, 8, 25);
    oldestWeekStart.setDate(oldestWeekStart.getDate() - 11 * 7);
    const entries: Record<string, unknown> = {};
    const isoFor = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(
        2,
        '0',
      )}`;
    for (let i = 0; i < 12; i++) {
      const d = new Date(oldestWeekStart);
      d.setDate(d.getDate() + i * 7);
      entries[isoFor(d)] = { type: 'Run', completed: true };
    }
    // A second entry in the oldest week, one day after the first (still
    // within the same Sunday-Saturday span).
    const secondOldestWeekDate = new Date(oldestWeekStart);
    secondOldestWeekDate.setDate(secondOldestWeekDate.getDate() + 1);
    entries[isoFor(secondOldestWeekDate)] = { type: 'Bike', completed: true };

    const { container } = render(TrendChart, { props: { entries } });
    const bars = container.querySelectorAll('.trend-bar');

    expect(bars).toHaveLength(12);
    // Oldest week (index 0, count 2) is the max -> 100% height.
    expect((bars[0] as HTMLElement).getAttribute('style')).toContain('height: 100%');
    // Every other week (count 1) is exactly half of the max -> 50% height.
    for (let i = 1; i < bars.length; i++) {
      expect((bars[i] as HTMLElement).getAttribute('style')).toContain('height: 50%');
    }
  });

  it('AC4: fewer than 12 weeks elapsed since the first-ever Log Entry shows only the elapsed weeks, including a zero-count week within that span, never a week before the first entry', () => {
    // First-ever entry falls in the week starting 2026-09-06 -- two weeks
    // before FIXED_TODAY's own week (starting 2026-09-20). Only 3 weeks
    // should render: 09-06's week (the first entry), 09-13's week (left
    // deliberately empty -- must still render as a zero-count bar), and
    // 09-20's week (today's own, current week) -- never the full 12.
    const firstEntryDate = '2026-09-08';
    const entries: Record<string, unknown> = {
      [firstEntryDate]: { type: 'Run', completed: true },
      '2026-09-25': { type: 'Bike', completed: true }, // today's own entry, in the current week
    };

    const { container } = render(TrendChart, { props: { entries } });
    const columns = container.querySelectorAll('.trend-bar-column');

    // Exactly 3 elapsed weeks -- the first entry's own week, one empty week
    // in between, and the current week -- never the full 12-week window.
    expect(columns).toHaveLength(3);
  });

  it('Epic 3 retro regression (F2): a future-dated completed entry (marking a future-scheduled workout complete is not prevented elsewhere) never leaves an unexplained empty chart', () => {
    // The only Log Entry is dated after `currentWeekStartIso` -- confirmed
    // reproducible before this fix: `hasAnyEntries` was true (suppressing the
    // zero-state copy) while `visibleWeeks` was empty (no bars at all),
    // because clamping only the filter's upper bound can't fix a
    // `firstEntryWeekStartIso` that itself exceeds the trend window's own
    // upper bound.
    const entries: Record<string, unknown> = {
      '2026-10-15': { type: 'Run', completed: true }, // FIXED_TODAY is 2026-09-25
    };

    const { container, queryByText } = render(TrendChart, { props: { entries } });

    expect(
      queryByText("Your trends will show up here once you've logged a few workouts"),
    ).toBeNull();
    expect(container.querySelectorAll('.trend-bar-column').length).toBeGreaterThan(0);
  });

  it('AC2: recomputes when the entries prop changes to a new object (live update, no manual refresh)', async () => {
    const { container, rerender } = render(TrendChart, { props: { entries: {} } });
    expect(container.querySelectorAll('.trend-bar')).toHaveLength(0);

    await rerender({ entries: { [FIXED_TODAY]: { type: 'Run', completed: true } } });

    expect(container.querySelectorAll('.trend-bar').length).toBeGreaterThan(0);
  });
});
