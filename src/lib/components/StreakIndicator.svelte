<script lang="ts">
  // Story 2.4 -- the quiet, always-visible Streak counter mounted on Home
  // (EXPERIENCE.md's `streak-indicator` Component Pattern / DESIGN.md's
  // token mapping: `{typography.meta}` in `{colors.text-secondary}`). A
  // plain text counter, deliberately not a pill/badge -- AC6's "never a
  // gamified badge" requirement.
  //
  // Renders `"{streak}-day streak"` uniformly for every count, including
  // `0` -- this app's established "honest zeros, never hidden" precedent
  // (Rollup's own zero-week state), rather than a separate empty-state
  // string for a brand-new install with nothing logged yet.
  let { streak }: { streak: number } = $props();
</script>

<p class="streak-indicator">{streak}-day streak</p>

<style>
  .streak-indicator {
    margin: 0 0 var(--space-6);
    font-family: var(--type-meta-font-family);
    font-size: var(--type-meta-size);
    font-weight: var(--type-meta-weight);
    font-variant-numeric: var(--type-meta-font-variant-numeric);
    color: var(--text-secondary);
  }
</style>
