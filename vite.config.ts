import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages *project* site: served at https://zach-ess.github.io/training-plan/,
// not a root/user site. base/start_url/scope must all be rooted at this subpath or
// every asset request, the manifest, and the service-worker scope will 404 / fail to
// register once deployed.
const BASE_PATH = '/training-plan/';

export default defineConfig({
  base: BASE_PATH,
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Training Journal',
        short_name: 'Training',
        start_url: BASE_PATH,
        scope: BASE_PATH,
        display: 'standalone',
        // Sourced from Story 1.2's `--background` design token (light value,
        // the page canvas color) -- the splash/install screen should match
        // the actual rendered page, not the card/tab-bar `--surface` color.
        // The Web App Manifest spec has no dark-mode variant for these
        // fields, so the light-mode hex is the correct single value here;
        // the live browser-chrome color still responds to OS scheme changes
        // via index.html's media-scoped `theme-color` meta tags (which use
        // `--surface`, the color of the chrome-adjacent tab bar).
        background_color: '#f3f5f6',
        theme_color: '#f3f5f6',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Story 1.1 precached plan.json here (via `json` in this glob list) as
        // part of the cache-first app shell. Story 1.4 supersedes that: it adds
        // its own Cache Storage layer (`planStore.svelte.ts`, cache name
        // `plan-cache-v1`) that reads a cached Plan for an instant paint and
        // then always issues a cache-busted network fetch for a silent
        // background refetch on every open. Workbox's `generateSW` precache
        // serving is `CacheFirst` per *exact* URL and only rotates to a new
        // response when a new deploy installs a new service-worker revision --
        // it doesn't revalidate per page-load, and while precached under its
        // exact URL, any request to that same URL (cache-busted query string or
        // not) is served from the precache regardless of fetch options, which
        // would silently defeat this story's freshness check. So `json` is
        // deliberately left out of this glob list -- plan.json is no longer
        // precached by the service worker at all.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
      },
    }),
  ],
});
