// Story 5.1 -- "Missed it": the Data Store's `setMissed` write, its
// interaction with Mark Complete (`setCompleted`) and Edit
// (`replaceLogEntry`), the never-silent failure path, and the loader keeping
// `missed: true` across a reload. The store is a module-level singleton read
// at import time, so each test resets the module registry and imports a
// fresh copy after arranging storage (same pattern as diagnostics.test.ts).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const LOG_KEY = 'log-entries-v1';
const DATE = '2026-11-05';

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

function stored(): Record<string, unknown> {
  return JSON.parse(localStorage.getItem(LOG_KEY) ?? '{}');
}

function seed(entries: Record<string, unknown>) {
  localStorage.setItem(LOG_KEY, JSON.stringify(entries));
}

async function loadStore() {
  return import('./logStore.svelte');
}

describe('setMissed(date, true)', () => {
  it('creates a bare { completed: false, missed: true } entry for an unchecked day', async () => {
    const { setMissed, logStore } = await loadStore();
    expect(setMissed(DATE, true)).toEqual({ ok: true });

    const expected = { date: DATE, completed: false, missed: true, schemaVersion: 1 };
    expect(logStore.entries[DATE]).toEqual(expected);
    expect(stored()[DATE]).toEqual(expected);
  });

  it('keeps type/duration/distance/notes on an existing Mark-Incomplete entry', async () => {
    seed({ [DATE]: { date: DATE, completed: false, type: 'Run', duration: '30 min', notes: 'legs dead', schemaVersion: 1 } });
    const { setMissed, logStore } = await loadStore();

    setMissed(DATE, true);

    expect(logStore.entries[DATE]).toEqual({
      date: DATE,
      completed: false,
      missed: true,
      type: 'Run',
      duration: '30 min',
      notes: 'legs dead',
      schemaVersion: 1,
    });
  });

  it('never touches another date', async () => {
    const other = { date: '2026-11-04', completed: true, type: 'Bike', schemaVersion: 1 };
    seed({ '2026-11-04': other });
    const { setMissed } = await loadStore();

    setMissed(DATE, true);

    expect(stored()['2026-11-04']).toEqual(other);
  });
});

describe('setMissed(date, false) -- Undo missed', () => {
  it('removes a bare missed entry entirely, so the day is unchecked again', async () => {
    seed({ [DATE]: { date: DATE, completed: false, missed: true, schemaVersion: 1 } });
    const { setMissed, logStore } = await loadStore();

    expect(setMissed(DATE, false)).toEqual({ ok: true });

    expect(DATE in logStore.entries).toBe(false);
    expect(DATE in stored()).toBe(false);
  });

  it('removes only the flag when the entry also has logged data', async () => {
    seed({ [DATE]: { date: DATE, completed: false, missed: true, type: 'Run', duration: '30 min', schemaVersion: 1 } });
    const { setMissed, logStore } = await loadStore();

    setMissed(DATE, false);

    const entry = logStore.entries[DATE];
    expect(entry).toEqual({ date: DATE, completed: false, type: 'Run', duration: '30 min', schemaVersion: 1 });
    expect(entry && 'missed' in entry).toBe(false);
    expect(stored()[DATE]).toEqual(entry);
  });

  it('a mark then an undo round-trips to exactly the original state', async () => {
    const { setMissed, logStore } = await loadStore();
    setMissed(DATE, true);
    setMissed(DATE, false);
    expect(logStore.entries).toEqual({});
    expect(stored()).toEqual({});
  });
});

describe('Mark Complete and Edit clear missed', () => {
  it('setCompleted(date, true) writes completed: true and drops missed, keeping other fields', async () => {
    seed({ [DATE]: { date: DATE, completed: false, missed: true, type: 'Run', schemaVersion: 1 } });
    const { setCompleted, logStore } = await loadStore();

    setCompleted(DATE, true);

    const entry = logStore.entries[DATE];
    expect(entry).toEqual({ date: DATE, completed: true, type: 'Run', schemaVersion: 1 });
    expect(entry && 'missed' in entry).toBe(false);
    expect(stored()[DATE]).not.toHaveProperty('missed');
  });

  it('replaceLogEntry (Edit save) writes a fresh completed entry with no missed key', async () => {
    seed({ [DATE]: { date: DATE, completed: false, missed: true, schemaVersion: 1 } });
    const { replaceLogEntry, logStore } = await loadStore();

    replaceLogEntry(DATE, { type: 'Run', duration: '25 min' });

    expect(logStore.entries[DATE]).toEqual({ date: DATE, completed: true, type: 'Run', duration: '25 min', schemaVersion: 1 });
    expect(stored()[DATE]).not.toHaveProperty('missed');
  });
});

describe('setMissed write failure (AD-4)', () => {
  for (const [label, initial, value] of [
    ['marking', {}, true],
    ['undoing', { [DATE]: { date: DATE, completed: false, missed: true, schemaVersion: 1 } }, false],
  ] as const) {
    it(`${label}: returns { ok: false, reason } and leaves memory and storage unchanged`, async () => {
      seed(initial);
      const { setMissed, logStore } = await loadStore();
      const before = JSON.parse(JSON.stringify(logStore.entries));
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('full (simulated)', 'QuotaExceededError');
      });

      expect(setMissed(DATE, value)).toEqual({ ok: false, reason: 'quota-exceeded' });

      expect(logStore.entries).toEqual(before);
      expect(stored()).toEqual(initial);
    });
  }

  it('a non-quota failure reports write-error', async () => {
    const { setMissed } = await loadStore();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('boom');
    });
    expect(setMissed(DATE, true)).toEqual({ ok: false, reason: 'write-error' });
  });
});

describe('reload', () => {
  it('a stored missed entry is still missed after the module reloads', async () => {
    const first = await loadStore();
    first.setMissed(DATE, true);

    vi.resetModules();
    const second = await loadStore();

    expect(second.logStore.entries[DATE]).toEqual({ date: DATE, completed: false, missed: true, schemaVersion: 1 });
  });

  it('the loader keeps missed only as true paired with completed: false', async () => {
    seed({
      '2026-11-01': { date: '2026-11-01', completed: false, missed: false, schemaVersion: 1 },
      '2026-11-02': { date: '2026-11-02', completed: false, missed: 'yes', schemaVersion: 1 },
      '2026-11-03': { date: '2026-11-03', completed: true, missed: true, schemaVersion: 1 },
    });
    const { logStore } = await loadStore();

    for (const date of ['2026-11-01', '2026-11-02', '2026-11-03']) {
      expect(logStore.entries[date]).toBeDefined();
      expect(logStore.entries[date]).not.toHaveProperty('missed');
    }
  });
});
