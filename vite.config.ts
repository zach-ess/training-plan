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
        // AD-5's cache-first app shell must also cover the runtime-fetched Plan data.
        // `public/plan.json` does land in the built `dist/` directory alongside the
        // JS/CSS/HTML -- Workbox's *default* glob extension list just doesn't include
        // `.json`, so it's added explicitly here to precache plan.json too.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest,json}'],
      },
    }),
  ],
});
