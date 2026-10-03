import './app.css';
import { mount } from 'svelte';
import Root from './Root.svelte';

// Story 1.4, AD-6 -- best-effort, one-time request for persistent storage so
// the Plan cache (Cache Storage API, planStore.svelte.ts) and future
// LogEntry/WeekEndReview data (localStorage) are less likely to be evicted
// under storage pressure. Feature-detected and fire-and-forget: its outcome
// (granted, denied, or the API being unsupported) never blocks or branches
// app behavior, so it's deliberately not awaited before mount.
if ('storage' in navigator && 'persist' in navigator.storage) {
  // `.catch()` rather than a bare `void`: every other new async call this
  // story added is defensively wrapped, and a rejected promise here (e.g. a
  // restricted/sandboxed embedding context) would otherwise be this file's
  // one unhandled-rejection exception. Still fire-and-forget -- the outcome
  // never blocks or branches app behavior either way.
  navigator.storage.persist().catch((error) => {
    // Story 4.1 -- console only, never UI (epic-1-retro-item-9).
    console.warn('main: persistent storage request failed', error);
  });
}

const target = document.getElementById('app');

if (!target) {
  throw new Error('Root mount element "#app" not found in index.html');
}

const app = mount(Root, { target });

export default app;
