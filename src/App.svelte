<script lang="ts">
  // Placeholder shell for Story 1.1 (scaffold + installability only), now
  // wired to Story 1.2's design tokens as a smoke test. Two-tab navigation
  // (Story 1.3), Day-List rendering (1.5), and the top-level error boundary
  // (1.6) are out of this story's scope and land in later stories.
  const appName = 'Training Journal';
</script>

<main>
  <h1>{appName}</h1>
  <p>Scaffold placeholder -- Home/Day-List arrives in Story 1.5.</p>
</main>

<style>
  main {
    background: var(--background);
    color: var(--text-primary);
    padding: var(--space-7);
  }

  h1 {
    font-family: var(--type-title-font-family);
    font-size: var(--type-title-size);
    font-weight: var(--type-title-weight);
  }

  p {
    font-family: var(--type-body-font-family);
    font-size: var(--type-body-size);
    font-weight: var(--type-body-weight);
    line-height: var(--type-body-line-height);
  }
</style>
