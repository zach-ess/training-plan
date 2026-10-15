// Epic 4 retro A7 -- `addDaysIso`, the one day-offset helper. Local-date
// arithmetic, so month/year ends and DST changes never shift it a day.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { addDaysIso } from './date';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('addDaysIso', () => {
  it('adds and subtracts within a month, and zero is a no-op', () => {
    expect(addDaysIso('2026-10-12', 6)).toBe('2026-10-18');
    expect(addDaysIso('2026-10-18', -6)).toBe('2026-10-12');
    expect(addDaysIso('2026-10-12', 0)).toBe('2026-10-12');
  });

  it('crosses month and year boundaries, including a leap day', () => {
    expect(addDaysIso('2026-10-26', 6)).toBe('2026-11-01');
    expect(addDaysIso('2026-12-28', 6)).toBe('2027-01-03');
    expect(addDaysIso('2027-01-03', -6)).toBe('2026-12-28');
    expect(addDaysIso('2028-02-28', 1)).toBe('2028-02-29');
  });

  // Pinned to a US zone so the DST days exist whatever zone the test runs in.
  it('is unaffected by DST changes (US: Mar 8 and Nov 1, 2026)', () => {
    vi.stubEnv('TZ', 'America/Chicago');
    // Guard: the pin took effect, so these really are DST days here.
    expect(new Date(2026, 2, 7).getTimezoneOffset()).not.toBe(new Date(2026, 2, 9).getTimezoneOffset());
    expect(addDaysIso('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDaysIso('2026-03-08', 1)).toBe('2026-03-09');
    expect(addDaysIso('2026-11-01', 1)).toBe('2026-11-02');
    expect(addDaysIso('2026-11-02', -1)).toBe('2026-11-01');
  });
});
