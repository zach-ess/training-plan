// Story 4.4 (review loop 1) -- regression coverage for week-header placement,
// above all the case that broke the first build: a week whose start date
// (a rest-only Monday) isn't in the rendered day range.
import { describe, it, expect } from 'vitest';
import { getWeekHeaderDates } from './getWeekHeaderDates';
import type { PlanWeek } from './parsePlan';

function days(from: string, to: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  while (cursor <= end) {
    out.push(
      `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`,
    );
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

const W1: PlanWeek = { weekNumber: 1, startDate: '2026-10-12', endDate: '2026-10-18' };
const W2: PlanWeek = { weekNumber: 2, startDate: '2026-10-19', endDate: '2026-10-25' };

describe('getWeekHeaderDates', () => {
  it('places each header at its week start when that day is rendered', () => {
    const headers = getWeekHeaderDates(days('2026-10-11', '2026-10-25'), [W1, W2]);
    expect([...headers.entries()]).toEqual([
      ['2026-10-12', W1],
      ['2026-10-19', W2],
    ]);
  });

  it('moves a header to the first rendered day of its week when the start is not rendered', () => {
    // Today is past the rest-only Monday, and the first workout is Tuesday:
    // the list starts at Oct 13, so Week 1 must still get its header there.
    const headers = getWeekHeaderDates(days('2026-10-13', '2026-10-25'), [W1, W2]);
    expect(headers.get('2026-10-13')).toBe(W1);
    expect(headers.get('2026-10-19')).toBe(W2);
    expect(headers.size).toBe(2);
  });

  it('gives no header to a week with no rendered day', () => {
    const headers = getWeekHeaderDates(days('2026-10-19', '2026-10-25'), [W1, W2]);
    expect([...headers.values()]).toEqual([W2]);
  });

  it('keeps the first-listed week when two land on the same date', () => {
    const overlap: PlanWeek = { weekNumber: 9, startDate: '2026-10-10', endDate: '2026-10-16' };
    const headers = getWeekHeaderDates(days('2026-10-13', '2026-10-18'), [W1, overlap]);
    expect(headers.get('2026-10-13')).toBe(W1);
    expect(headers.size).toBe(1);
  });

  it('returns an empty map when the Plan has no weeks', () => {
    expect(getWeekHeaderDates(days('2026-10-11', '2026-10-25'), undefined).size).toBe(0);
    expect(getWeekHeaderDates(days('2026-10-11', '2026-10-25'), []).size).toBe(0);
  });
});
