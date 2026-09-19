import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// Minimal config so editor tooling (e.g. the VS Code Svelte extension) and
// svelte-check pick up standard preprocessing -- becomes load-bearing once
// path aliases or non-default preprocessing (SCSS, etc.) are introduced.
export default {
  preprocess: vitePreprocess(),
};
