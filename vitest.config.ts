import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Deliberately a separate config from vite.config.ts, not a merged `test`
// block added to it: this project's real vite.config.ts pulls in
// vite-plugin-pwa (service worker generation, manifest emission) and does
// its own workbox.globPatterns/base-path bookkeeping (see that file's own
// comments) -- none of that has any business running under Vitest, and
// keeping the two configs apart means a future change to the PWA/build
// config can never accidentally change what the test suite does, or vice
// versa. Only the Svelte plugin is shared, since components can't compile
// without it.
export default defineConfig({
  plugins: [svelte()],
  // Without this, Vite/Vitest resolves the `svelte` package's server-side
  // build (mount() throws `lifecycle_function_unavailable` there) instead of
  // its client build, even though `test.environment` below is `jsdom` --
  // module resolution and the test environment are separate concerns, and
  // this is the documented fix for Svelte + Vitest specifically (found by
  // hitting the actual error while first getting this harness running).
  resolve: {
    conditions: ['browser'],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    // Regression-test scope only (Epic 2 retro, action item 8/12, 2026-09-24):
    // this harness exists to catch the specific bug class the retro found --
    // silent focus-management failures across component boundaries, and
    // uncaught-throw-crashes-the-app-wide-error-boundary interactions --
    // not to chase broad coverage. Test files live next to what they cover,
    // same as every other file in this codebase.
    include: ['src/**/*.test.ts'],
  },
});
