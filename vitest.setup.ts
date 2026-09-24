// Registers @testing-library/jest-dom's matchers (toBeDisabled, etc.) on
// Vitest's `expect` -- this package ships no `/vitest` entry point (only
// `/jest-globals`), so this is the documented manual wiring for a
// non-Jest runner rather than a workaround.
import { expect, vi } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';

expect.extend(matchers);

// jsdom doesn't implement window.matchMedia at all (calling it throws
// "not a function") -- every component under test that reads
// prefers-reduced-motion (CompletionCelebration) needs *some* implementation
// present. Stubbed here as `matches: true` (reduced motion) rather than
// `false`, purely so tests settle on the shorter SETTLE_MS path by default
// and don't need to wait out the full animated duration; nothing in this
// codebase's actual behavior differs based on which stub value is used.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  configurable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
