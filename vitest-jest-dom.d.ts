// Manual type augmentation wiring @testing-library/jest-dom's matchers into
// Vitest's `expect`. This package's shipped types only augment Jest's own
// `expect` (see its types/index.d.ts, which references only jest.d.ts) --
// it has no `/vitest` type export in the installed version, mirroring the
// same gap vitest.setup.ts's comment already notes for the runtime side.
// Without this, `expect(el).toBeDisabled()` etc. type-check correctly at
// runtime (vitest.setup.ts's `expect.extend(matchers)` really does add
// them) but fail `svelte-check`/`tsc` as unknown properties on `Assertion`.
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

declare module 'vitest' {
  interface Assertion<T = any> extends TestingLibraryMatchers<T, void> {}
  interface AsymmetricMatchersContaining extends TestingLibraryMatchers<unknown, void> {}
}
