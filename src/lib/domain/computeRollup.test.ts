// Story 3.2 -- Rollups & Trend Chart: regression coverage for
// `computeRollup`'s count/range/bucket rules (this spec's I/O matrix). A pure
// function with no Data Store import, so these tests build `entries` directly
// rather than going through `logStore.svelte.ts`.
import { describe, it, expect } from 'vitest';
import { computeRollup } from './computeRollup';

describe('computeRollup', () => {
  it('AC1: counts per type for a date range, mixed types, never blended', () => {
    const entries: Record<string, unknown> = {
      '2026-09-01': { type: 'Run', completed: true },
      '2026-09-02': { type: 'Run', completed: true },
      '2026-09-03': { type: 'Bike', completed: true },
      '2026-09-04': { type: 'Lift', completed: true },
    };

    const rollup = computeRollup(entries, '2026-09-01', '2026-09-30');

    expect(rollup.Run).toBe(2);
    expect(rollup.Bike).toBe(1);
    expect(rollup.Lift).toBe(1);
    expect(rollup.Mobility).toBe(0);
    expect(rollup.Stretch).toBe(0);
    expect(rollup.Other).toBe(0);
    expect(rollup.Unspecified).toBe(0);
  });

  it('entries outside the range are excluded', () => {
    const entries: Record<string, unknown> = {
      '2026-08-31': { type: 'Run', completed: true }, // just before the range
      '2026-09-01': { type: 'Run', completed: true }, // range start, inclusive
      '2026-09-30': { type: 'Bike', completed: true }, // range end, inclusive
      '2026-10-01': { type: 'Bike', completed: true }, // just after the range
    };

    const rollup = computeRollup(entries, '2026-09-01', '2026-09-30');

    expect(rollup.Run).toBe(1);
    expect(rollup.Bike).toBe(1);
  });

  it('AC7: a Log Entry with no type field is counted under Unspecified', () => {
    const entries: Record<string, unknown> = {
      '2026-09-10': { completed: true },
    };

    const rollup = computeRollup(entries, '2026-09-01', '2026-09-30');

    expect(rollup.Unspecified).toBe(1);
    expect(rollup.Run).toBe(0);
  });

  it('a recognized non-preset type (WorkoutEditForm\'s "Other" free text) is counted under Other', () => {
    const entries: Record<string, unknown> = {
      '2026-09-10': { type: 'yoga', completed: true },
    };

    const rollup = computeRollup(entries, '2026-09-01', '2026-09-30');

    expect(rollup.Other).toBe(1);
  });

  it('a Log Entry explicitly marked completed: false (Mark Incomplete) is not counted, even though setCompleted preserves its type/duration/distance', () => {
    const entries: Record<string, unknown> = {
      '2026-09-10': { type: 'Run', duration: '30 min', completed: false },
    };

    const rollup = computeRollup(entries, '2026-09-01', '2026-09-30');

    expect(rollup.Run).toBe(0);
    const total = Object.values(rollup).reduce((sum, count) => sum + count, 0);
    expect(total).toBe(0);
  });

  it('zero entries anywhere: every bucket is zero, never omitted', () => {
    const rollup = computeRollup({}, '2026-09-01', '2026-09-30');

    expect(rollup).toEqual({
      Run: 0,
      Bike: 0,
      Lift: 0,
      Mobility: 0,
      Stretch: 0,
      Other: 0,
      Unspecified: 0,
    });
  });

  it('month/year boundary: a period starting and ending on the same day only counts that day\'s own entry, not the prior day', () => {
    const entries: Record<string, unknown> = {
      '2026-08-31': { type: 'Run', completed: true }, // prior month, must not bleed in
      '2026-09-01': { type: 'Bike', completed: true }, // the 1st itself
    };

    const rollup = computeRollup(entries, '2026-09-01', '2026-09-01');

    expect(rollup.Bike).toBe(1);
    expect(rollup.Run).toBe(0);
  });

  it('a malformed stored value (not an object) is skipped rather than counted or crashing', () => {
    const entries: Record<string, unknown> = {
      '2026-09-10': 'not-an-object',
      '2026-09-11': { type: 'Run', completed: true },
    };

    const rollup = computeRollup(entries, '2026-09-01', '2026-09-30');

    expect(rollup.Run).toBe(1);
    const total = Object.values(rollup).reduce((sum, count) => sum + count, 0);
    expect(total).toBe(1);
  });
});
