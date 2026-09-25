// Story 3.2 -- Rollups & Trend Chart: regression coverage for RollupSummary's
// month-to-date/year-to-date rendering (this spec's I/O matrix). `getTodayIso`
// is mocked to a fixed date, mirroring `DayRowCard.test.ts`/
// `HistoryView.test.ts`'s own convention. This component takes `entries` as a
// prop (HistoryView does the one real `logStore.entries` read and forwards it
// down), so these tests build `entries` directly rather than going through
// `logStore.svelte.ts`.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/svelte';
import RollupSummary from './RollupSummary.svelte';

const FIXED_TODAY = '2026-09-25';

// A mutable "today" (reset after every test) rather than one fixed constant --
// the month/year-boundary test below needs `getTodayIso()` to return the 1st
// of a month/year specifically, which `FIXED_TODAY` alone can't cover.
let currentToday = FIXED_TODAY;

vi.mock('../domain/date', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../domain/date')>();
  return { ...actual, getTodayIso: () => currentToday };
});

afterEach(() => {
  currentToday = FIXED_TODAY;
});

/** Reads the rendered count for `type` within the section labelled
 * `periodLabel` ("Month to date" / "Year to date"). */
function readCount(container: HTMLElement, periodLabel: string, type: string): string | null {
  const section = Array.from(container.querySelectorAll('section')).find(
    (el) => el.getAttribute('aria-label') === periodLabel,
  );
  const item = Array.from(section?.querySelectorAll('.rollup-item') ?? []).find(
    (el) => el.querySelector('.rollup-type-label')?.textContent === type,
  );
  return item?.querySelector('.rollup-stat-value')?.textContent ?? null;
}

describe('RollupSummary', () => {
  it('AC3: zero Log Entries anywhere renders all-zero totals per type, never hidden', () => {
    const { container } = render(RollupSummary, { props: { entries: {} } });

    for (const period of ['Month to date', 'Year to date']) {
      for (const type of ['Run', 'Bike', 'Lift', 'Mobility', 'Stretch', 'Other', 'Unspecified']) {
        expect(readCount(container, period, type)).toBe('0');
      }
    }
  });

  it('AC6/AC1: month-to-date and year-to-date are broken out per type in stat-value typography, never one blended figure', () => {
    const entries: Record<string, unknown> = {
      '2026-09-10': { type: 'Run', completed: true },
      '2026-09-11': { type: 'Run', completed: true },
      '2026-09-12': { type: 'Bike', completed: true },
    };

    const { container } = render(RollupSummary, { props: { entries } });

    expect(readCount(container, 'Month to date', 'Run')).toBe('2');
    expect(readCount(container, 'Month to date', 'Bike')).toBe('1');
    expect(readCount(container, 'Month to date', 'Lift')).toBe('0');
    expect(readCount(container, 'Year to date', 'Run')).toBe('2');

    const statValues = container.querySelectorAll('.rollup-stat-value');
    expect(statValues.length).toBeGreaterThan(0);
  });

  it('a Log Entry explicitly marked completed: false (Mark Incomplete) is not counted, even though its type/duration/distance are preserved', () => {
    const entries: Record<string, unknown> = {
      '2026-09-10': { type: 'Run', completed: false },
    };

    const { container } = render(RollupSummary, { props: { entries } });

    expect(readCount(container, 'Month to date', 'Run')).toBe('0');
  });

  it('.rollup-item elements render in the fixed TYPE_ORDER sequence, never reordered by count', () => {
    const entries: Record<string, unknown> = {
      '2026-09-10': { type: 'Stretch', completed: true }, // deliberately last-alphabetically-ish
      '2026-09-11': { type: 'Run', completed: true },
      '2026-09-12': { type: 'Run', completed: true },
    };

    const { container } = render(RollupSummary, { props: { entries } });
    const section = Array.from(container.querySelectorAll('section')).find(
      (el) => el.getAttribute('aria-label') === 'Month to date',
    );
    const labels = Array.from(section?.querySelectorAll('.rollup-item .rollup-type-label') ?? []).map(
      (el) => el.textContent,
    );

    expect(labels).toEqual(['Run', 'Bike', 'Lift', 'Mobility', 'Stretch', 'Other', 'Unspecified']);
  });

  it('AC7: a Log Entry with no type field is counted under Unspecified', () => {
    const entries: Record<string, unknown> = {
      '2026-09-10': { completed: true },
    };

    const { container } = render(RollupSummary, { props: { entries } });

    expect(readCount(container, 'Month to date', 'Unspecified')).toBe('1');
  });

  it('year-to-date includes an entry from an earlier month this year, but month-to-date excludes it', () => {
    const entries: Record<string, unknown> = {
      '2026-03-15': { type: 'Lift', completed: true }, // earlier this year, outside the current month
    };

    const { container } = render(RollupSummary, { props: { entries } });

    expect(readCount(container, 'Year to date', 'Lift')).toBe('1');
    expect(readCount(container, 'Month to date', 'Lift')).toBe('0');
  });

  it('I/O matrix "month/year boundary": today is the 1st of a month/year -- both totals reset to that day\'s own entry only, not bleeding in the prior period\'s entries', () => {
    currentToday = '2026-01-01'; // simultaneously the 1st of the month AND the year
    const entries: Record<string, unknown> = {
      '2025-12-31': { type: 'Run', completed: true }, // last year's last day -- must not bleed in
      '2026-01-01': { type: 'Bike', completed: true }, // today, the 1st itself
    };

    const { container } = render(RollupSummary, { props: { entries } });

    expect(readCount(container, 'Month to date', 'Bike')).toBe('1');
    expect(readCount(container, 'Month to date', 'Run')).toBe('0');
    expect(readCount(container, 'Year to date', 'Bike')).toBe('1');
    expect(readCount(container, 'Year to date', 'Run')).toBe('0');
  });

  it('an entry from last year is excluded from year-to-date', () => {
    const entries: Record<string, unknown> = {
      '2025-12-31': { type: 'Run', completed: true },
    };

    const { container } = render(RollupSummary, { props: { entries } });

    expect(readCount(container, 'Year to date', 'Run')).toBe('0');
  });

  it('AC2: recomputes when the entries prop changes to a new object (live update, no manual refresh)', async () => {
    const { container, rerender } = render(RollupSummary, { props: { entries: {} } });
    expect(readCount(container, 'Month to date', 'Run')).toBe('0');

    await rerender({ entries: { [FIXED_TODAY]: { type: 'Run', completed: true } } });

    expect(readCount(container, 'Month to date', 'Run')).toBe('1');
  });
});
