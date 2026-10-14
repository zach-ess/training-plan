// Epic 4 retro A5 (F4): the Plan is parsed once per `planStore.plan` value,
// however many views read it, so each parse diagnostic prints once.
// A `.svelte.test.ts` file so the readers can be real `$effect`s.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { flushSync } from 'svelte';
import { planStore, loadPlan } from '../data/planStore.svelte';
import { getParsedPlan } from './parsedPlan.svelte';
import type { Plan } from './parsePlan';

const BAD_WEEK_WARNING = 'parsePlan: dropping week with invalid or missing startDate';

function planWithBadWeek(note: string) {
  return {
    note,
    workouts: [{ date: '2026-10-13', type: 'Run' }],
    weeks: [{ weekNumber: 1, startDate: 'not-a-date' }],
  };
}

function badWeekWarnings(warn: ReturnType<typeof vi.spyOn>) {
  return warn.mock.calls.filter((call: unknown[]) => call[0] === BAD_WEEK_WARNING).length;
}

let cleanupRoot: (() => void) | undefined;

afterEach(() => {
  cleanupRoot?.();
  cleanupRoot = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('getParsedPlan', () => {
  it('parses once for three readers, and once more only when planStore.plan changes', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    planStore.plan = planWithBadWeek('first');
    const seen: Plan[] = [];

    cleanupRoot = $effect.root(() => {
      // Three readers, like App.svelte, HistoryView.svelte and WeekEndReview.svelte.
      for (let reader = 0; reader < 3; reader++) {
        $effect(() => {
          seen.push(getParsedPlan());
        });
      }
    });
    flushSync();

    expect(seen).toHaveLength(3);
    // One shared parse: every reader got the very same Plan object.
    expect(seen[1]).toBe(seen[0]);
    expect(seen[2]).toBe(seen[0]);
    expect(badWeekWarnings(warn)).toBe(1);

    planStore.plan = { ...planWithBadWeek('second'), workouts: [{ date: '2026-10-14', type: 'Lift' }] };
    flushSync();

    expect(seen).toHaveLength(6);
    expect(seen[3]).not.toBe(seen[0]);
    expect(seen[4]).toBe(seen[3]);
    expect(seen[5]).toBe(seen[3]);
    expect(seen[3].workouts.map((w) => w.date)).toEqual(['2026-10-14']);
    expect(badWeekWarnings(warn)).toBe(2);
  });

  it('startup -- cached plan, then an identical background refetch -- warns once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const body = JSON.stringify(planWithBadWeek('startup'));
    vi.stubGlobal('caches', {
      open: vi.fn(() =>
        Promise.resolve({ match: () => Promise.resolve(new Response(body)), put: () => Promise.resolve() }),
      ),
    });
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(body, { status: 200 }))));
    planStore.plan = null;
    planStore.status = 'loading';
    const seen: Plan[] = [];
    cleanupRoot = $effect.root(() => {
      for (let reader = 0; reader < 3; reader++) {
        $effect(() => {
          seen.push(getParsedPlan());
        });
      }
    });
    flushSync();
    const beforeLoad = badWeekWarnings(warn);

    await loadPlan();
    flushSync();

    expect(planStore.status).toBe('loaded');
    expect(seen.at(-1)?.workouts.map((w) => w.date)).toEqual(['2026-10-13']);
    expect(badWeekWarnings(warn) - beforeLoad).toBe(1);
  });
});
