// Story 4.3 -- WorkoutDetail's Week-End Review action: Sunday-only, never for
// a future Sunday, "Review this week" while that week is unsaved and "View
// this week's review" once saved, hidden while editing, calling
// `onOpenReview(date)`. A separate file from WorkoutDetail.test.ts so "today"
// can be pinned (`getTodayIso` mocked) without changing that file's fixtures.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import WorkoutDetail from './WorkoutDetail.svelte';
import { weekEndReviewStore, type WeekEndReview } from '../data/weekEndReviewStore.svelte';
import type { Workout } from '../domain/parsePlan';

const FIXED_TODAY = '2026-10-21'; // a Wednesday
const today = vi.hoisted(() => ({ iso: '2026-10-21' }));

vi.mock('../domain/date', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../domain/date')>();
  return { ...actual, getTodayIso: () => today.iso };
});

afterEach(() => {
  cleanup();
  today.iso = FIXED_TODAY;
  delete weekEndReviewStore.reviews['2026-10-11'];
});

const run = (date: string): Workout => ({ date, type: 'Run', duration: '40 min' });

function savedReview(sunday: string): WeekEndReview {
  return {
    weekStartIso: sunday,
    workoutsCompleted: 3,
    byType: { Run: 3, Bike: 0, Lift: 0, Mobility: 0, Stretch: 0, Other: 0, Unspecified: 0 },
    streak: 3,
    missedCount: 0,
    reflection: 'Steady.',
    schemaVersion: 1,
  };
}

function renderDetail(date: string, onOpenReview = vi.fn()) {
  const result = render(WorkoutDetail, { props: { date, workout: run(date), onClose: vi.fn(), onOpenReview } });
  return { ...result, onOpenReview };
}

describe('WorkoutDetail -- Week-End Review action (Story 4.3)', () => {
  it('a past Sunday with no saved Review offers "Review this week" and opens it with that date', async () => {
    const sunday = '2026-10-18';
    const { getByRole, onOpenReview } = renderDetail(sunday);

    await fireEvent.click(getByRole('button', { name: 'Review this week' }));

    expect(onOpenReview).toHaveBeenCalledWith(sunday);
  });

  it('a Sunday whose week is saved offers "View this week\'s review"', async () => {
    const sunday = '2026-10-11';
    weekEndReviewStore.reviews[sunday] = savedReview(sunday);
    const { getByRole, queryByRole, onOpenReview } = renderDetail(sunday);

    expect(queryByRole('button', { name: 'Review this week' })).toBeNull();
    await fireEvent.click(getByRole('button', { name: "View this week's review" }));
    expect(onOpenReview).toHaveBeenCalledWith(sunday);
  });

  it('when today is the Sunday itself, it offers "Review this week" (alongside the Home banner)', () => {
    today.iso = '2026-11-01'; // a Sunday, no saved review
    const { queryByRole } = renderDetail('2026-11-01');
    expect(queryByRole('button', { name: 'Review this week' })).not.toBeNull();
  });

  it('a future Sunday has no review action', () => {
    const { queryByRole } = renderDetail('2026-10-25');
    expect(queryByRole('button', { name: /this week/ })).toBeNull();
  });

  it('a weekday has no review action', () => {
    const { queryByRole } = renderDetail('2026-10-20');
    expect(queryByRole('button', { name: /this week/ })).toBeNull();
  });

  it('the action is hidden while editing', async () => {
    const { getByRole, queryByRole } = renderDetail('2026-10-04');
    expect(queryByRole('button', { name: 'Review this week' })).not.toBeNull();

    await fireEvent.click(getByRole('button', { name: 'Edit' }));

    expect(queryByRole('button', { name: 'Review this week' })).toBeNull();
  });
});
