// Story 5.2 -- the unchecked-day counter on Home with an adjustable today
// (CLAUDE.md testing lesson / Epic 4 retro A8): boundary days through the
// real App wiring, and the reload when the app is resumed on a new day.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import App from './App.svelte';
import { planStore } from './lib/data/planStore.svelte';
import { logStore } from './lib/data/logStore.svelte';
import { weekEndReviewStore } from './lib/data/weekEndReviewStore.svelte';
import type { Workout } from './lib/domain/parsePlan';

const today = vi.hoisted(() => ({ iso: '2027-04-20' }));

vi.mock('./lib/domain/date', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/domain/date')>();
  return { ...actual, getTodayIso: () => today.iso };
});

// Planned day X (a Tuesday), left unchecked, inside a plan running past it.
const X = '2027-04-20';
const PLAN: Workout[] = [
  { date: X, type: 'Run', duration: '30 min' },
  { date: '2027-04-30', type: 'Run', duration: '30 min' },
];

const originalScrollIntoView = Element.prototype.scrollIntoView;

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn() as unknown as Element['scrollIntoView'];
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  localStorage.clear();
  logStore.entries = {};
  weekEndReviewStore.reviews = {};
  planStore.plan = { workouts: PLAN };
  planStore.status = 'loaded';
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Element.prototype.scrollIntoView = originalScrollIntoView;
  localStorage.clear();
  logStore.entries = {};
});

async function renderApp() {
  const result = render(App);
  await tick();
  return result;
}

function counterText(container: HTMLElement): string {
  return (container.querySelector('#panel-home .unchecked-line')?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

describe('App -- unchecked counter boundary days (Story 5.2)', () => {
  it('today = X: 0 unchecked plus the today-open line', async () => {
    today.iso = X;
    const { container } = await renderApp();
    expect(counterText(container)).toBe('0 unchecked. Keep showing up.');
    expect(screen.getByText("Today's still open. Done or missed — own it.")).toBeInTheDocument();
  });

  for (const [label, iso] of [
    ['X+1', '2027-04-21'],
    ['X+2', '2027-04-22'],
  ] as const) {
    it(`today = ${label}: 1 day unchecked, no today-open line`, async () => {
      today.iso = iso;
      const { container } = await renderApp();
      expect(counterText(container)).toBe('1 day unchecked. No excuses — log it.');
      expect(screen.queryByText(/Today's still open/)).toBeNull();
    });
  }

  it('on a Sunday the counter is still the first thing in Home, above the Week-End Review banner', async () => {
    today.iso = '2027-04-25';
    const { container } = await renderApp();
    const panel = container.querySelector('#panel-home')!;
    expect(panel.querySelector('#week-end-review-banner')).not.toBeNull();
    expect(panel.firstElementChild).toBe(panel.querySelector('.unchecked-counter'));
  });
});

describe('App -- reload when resumed on a new day (Story 5.2)', () => {
  let reload: ReturnType<typeof vi.fn>;
  let visibility: DocumentVisibilityState;

  beforeEach(() => {
    reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    visibility = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  });

  async function resume(hiddenFirst = true) {
    if (hiddenFirst) {
      visibility = 'hidden';
      document.dispatchEvent(new Event('visibilitychange'));
    }
    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    await tick();
  }

  it('does not reload when resumed on the same day', async () => {
    today.iso = X;
    await renderApp();
    await resume();
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads once when resumed on a later day', async () => {
    today.iso = X;
    await renderApp();
    today.iso = '2027-04-21';
    await resume();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload while hidden, even after the date changed', async () => {
    today.iso = X;
    await renderApp();
    today.iso = '2027-04-21';
    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    await tick();
    expect(reload).not.toHaveBeenCalled();
  });

  it('stops listening once App unmounts', async () => {
    today.iso = X;
    await renderApp();
    cleanup();
    today.iso = '2027-04-21';
    await resume();
    expect(reload).not.toHaveBeenCalled();
  });
});
