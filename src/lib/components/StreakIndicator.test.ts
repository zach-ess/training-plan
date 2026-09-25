// Story 2.4 -- Streak Tracking & Missed-Day Indication: regression coverage
// for StreakIndicator itself. Matrix Test Audit gap: every other new
// component this epic (WorkoutEditForm, CompletionCelebration, DayRowCard)
// got its own component-render test file, but the implementation subagent's
// diff only added domain-level (computeStreak) and DayRowCard coverage --
// nothing actually rendered this component and asserted its text, so the
// I/O matrix's own "brand-new install ... StreakIndicator reads '0-day
// streak'" row had no runtime test, only the static-analysis regex in
// verify-color-tokens.mjs (which checks the format string exists in source,
// not that the component renders it correctly for a given prop).
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import StreakIndicator from './StreakIndicator.svelte';

describe('StreakIndicator', () => {
  it('renders "0-day streak" for a brand-new install with nothing logged yet (I/O matrix)', () => {
    const { getByText } = render(StreakIndicator, { props: { streak: 0 } });
    expect(getByText('0-day streak')).toBeTruthy();
  });

  it('renders "{n}-day streak" for a positive count -- the same uniform format, not a pluralization branch', () => {
    const { getByText } = render(StreakIndicator, { props: { streak: 7 } });
    expect(getByText('7-day streak')).toBeTruthy();
  });

  it('renders as plain text, never a pill/badge element (AC6: quiet counter, never a gamified badge)', () => {
    const { container } = render(StreakIndicator, { props: { streak: 3 } });
    const el = container.querySelector('.streak-indicator');
    expect(el?.tagName).toBe('P');
  });
});
