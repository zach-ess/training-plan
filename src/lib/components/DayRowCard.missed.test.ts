// Story 5.1 -- a day checked in as "Missed it" reads "Missed · noted" with
// the meta "missed — checked in" (same chip and tint as an unchecked miss),
// while today keeps its "Today" label. The unacknowledged "Missed" for an
// unflagged past day is unchanged. Per CLAUDE.md's date-vs-today lesson,
// "today" is the adjustable `vi.hoisted` mock and each case is checked with
// today set to the day itself, the day after, and two days after.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { flushSync } from 'svelte';
import { render, cleanup } from '@testing-library/svelte';
import DayRowCard from './DayRowCard.svelte';
import { logStore, setMissed, setCompleted } from '../data/logStore.svelte';
import type { Workout } from '../domain/parsePlan';

const today = vi.hoisted(() => ({ iso: '2026-11-05' }));

vi.mock('../domain/date', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../domain/date')>();
  return { ...actual, getTodayIso: () => today.iso };
});

afterEach(() => {
  cleanup();
  today.iso = '2026-11-05';
  localStorage.clear();
  logStore.entries = {};
});

const run = (date: string): Workout => ({ date, type: 'Run', duration: '30 min' });

function renderRow(date: string, workout: Workout = run(date)) {
  const result = render(DayRowCard, {
    props: { date, workout, isToday: date === today.iso, onOpen: vi.fn() },
  });
  const row = result.container.querySelector('.day-row') as HTMLElement;
  return { ...result, row };
}

describe('DayRowCard -- marked missed (Story 5.1)', () => {
  const DAY = '2026-10-05';

  for (const [label, todayIso] of [
    ['the day after', '2026-10-06'],
    ['two days after', '2026-10-07'],
  ] as const) {
    it(`${label}: a marked-missed past day reads "Missed · noted" with the Missed chip and tint`, () => {
      expect(setMissed(DAY, true).ok).toBe(true);
      today.iso = todayIso;
      const { row, container, getByText, queryByText } = renderRow(DAY);

      expect(row).toHaveClass('missed');
      expect(container.querySelector('.chip')).toHaveClass('chip-missed');
      expect(getByText('Missed · noted')).toHaveClass('missed-label');
      expect(queryByText('Missed')).toBeNull();
      expect(getByText('missed — checked in')).toBeTruthy();
      expect(queryByText('missed — no log entry')).toBeNull();
      expect(row.getAttribute('aria-label')).toContain('missed — checked in');
    });
  }

  it('the day itself (today): keeps the "Today" label and chip; the meta reads "missed — checked in"', () => {
    const date = '2026-10-12';
    setMissed(date, true);
    today.iso = date;
    const { row, container, getByText, queryByText } = renderRow(date);

    expect(row).toHaveClass('today');
    expect(row).not.toHaveClass('missed');
    expect(container.querySelector('.chip')).toHaveClass('chip-today');
    expect(getByText('Today')).toBeTruthy();
    expect(queryByText('Missed · noted')).toBeNull();
    expect(getByText('missed — checked in')).toBeTruthy();
    expect(row.getAttribute('aria-label')).toContain('Today');
    expect(row.getAttribute('aria-label')).toContain('missed — checked in');
  });

  it('an unflagged past day still reads the unacknowledged "Missed" (no regression)', () => {
    today.iso = '2026-10-21';
    const { getByText, queryByText } = renderRow('2026-10-19');
    expect(getByText('Missed')).toBeTruthy();
    expect(getByText('missed — no log entry')).toBeTruthy();
    expect(queryByText('Missed · noted')).toBeNull();
  });

  it('a marked-missed entry that also carries logged data still reads "missed — checked in"', () => {
    const date = '2026-10-14';
    setCompleted(date, false, run(date)); // Mark Incomplete entry with type/duration
    setMissed(date, true);
    today.iso = '2026-10-16';
    const { getByText } = renderRow(date);
    expect(getByText('Missed · noted')).toBeTruthy();
    expect(getByText('missed — checked in')).toBeTruthy();
  });

  it('live: Undo missed flips the mounted row back to "Missed"; Mark Complete clears it entirely', () => {
    const date = '2026-10-15';
    setMissed(date, true);
    today.iso = '2026-10-17';
    const { row, getByText, queryByText } = renderRow(date);
    expect(getByText('Missed · noted')).toBeTruthy();

    flushSync(() => {
      setMissed(date, false);
    });
    expect(getByText('Missed')).toBeTruthy();
    expect(getByText('missed — no log entry')).toBeTruthy();

    flushSync(() => {
      setMissed(date, true);
    });
    flushSync(() => {
      setCompleted(date, true);
    });
    expect(row).not.toHaveClass('missed');
    expect(queryByText('Missed · noted')).toBeNull();
    expect(queryByText('Missed')).toBeNull();
  });
});
