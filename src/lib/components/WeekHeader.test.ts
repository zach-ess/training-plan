// Story 4.4 -- WeekHeader: the "Week N · range · phase" line plus focus, for
// every header row of the spec's I/O matrix, and its non-interactive heading
// semantics. Dates format with the runtime's default locale (en-US here),
// the same way DayRowCard.test.ts relies on real weekday formatting.
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import WeekHeader from './WeekHeader.svelte';
import type { PlanWeek } from '../domain/parsePlan';

afterEach(() => {
  cleanup();
});

function renderWeek(week: PlanWeek) {
  return render(WeekHeader, { props: { week } });
}

describe('WeekHeader', () => {
  it('a full Coach week: number, same-month range, phase, and the focus line', () => {
    const { getByRole, container } = renderWeek({
      weekNumber: 1,
      startDate: '2026-10-12',
      endDate: '2026-10-18',
      phase: 'Return',
      focus: 'Ease back in — short, easy, run/walk OK · 8 mi',
    });
    const heading = getByRole('heading', { level: 2 });
    expect(container.querySelector('.week-title')?.textContent).toBe('Week 1 · Oct 12–18 · Return');
    expect(container.querySelector('.week-focus')?.textContent).toBe('Ease back in — short, easy, run/walk OK · 8 mi');
    // The heading is the title line alone; the focus line is plain text after it.
    expect(heading.textContent).toBe('Week 1 · Oct 12–18 · Return');
  });

  // Epic 4 retro A6 (F8).
  it('a one-day week shows a single date, not "Oct 12–12"', () => {
    const { container } = renderWeek({ weekNumber: 1, startDate: '2026-10-12', endDate: '2026-10-12', phase: 'Return' });
    expect(container.querySelector('.week-title')?.textContent).toBe('Week 1 · Oct 12 · Return');
  });

  it('repeats the month when a week crosses into a new one', () => {
    const { container } = renderWeek({ weekNumber: 3, startDate: '2026-10-26', endDate: '2026-11-01', phase: 'Return' });
    expect(container.querySelector('.week-title')?.textContent).toBe('Week 3 · Oct 26–Nov 1 · Return');
  });

  it('crosses a year boundary without showing years', () => {
    const { container } = renderWeek({ weekNumber: 12, startDate: '2026-12-28', endDate: '2027-01-03' });
    expect(container.querySelector('.week-title')?.textContent).toBe('Week 12 · Dec 28–Jan 3');
  });

  it('without phase or focus: shows number and range only, no focus line', () => {
    const { container } = renderWeek({ weekNumber: 5, startDate: '2026-11-09', endDate: '2026-11-15' });
    expect(container.querySelector('.week-title')?.textContent).toBe('Week 5 · Nov 9–15');
    expect(container.querySelector('.week-focus')).toBeNull();
  });

  it('without a week number: shows range and phase only', () => {
    const { container } = renderWeek({ startDate: '2026-11-09', endDate: '2026-11-15', phase: 'Aerobic Base' });
    expect(container.querySelector('.week-title')?.textContent).toBe('Nov 9–15 · Aerobic Base');
  });

  it('is a label, not a control: nothing focusable, no tabindex, no button', () => {
    const { container } = renderWeek({ weekNumber: 1, startDate: '2026-10-12', endDate: '2026-10-18' });
    expect(container.querySelector('button, a, input, [tabindex]')).toBeNull();
  });
});
