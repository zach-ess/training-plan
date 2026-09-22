<script lang="ts">
  // Story 2.1 -- WorkoutDetailStat: a single stat tile (duration or
  // distance) inside WorkoutDetail. Purely presentational -- DESIGN.md's
  // `workout-detail-stat` component spec: `{colors.surface}` background,
  // `{colors.border}` outline, `{rounded.sm}` corners; value in
  // `{typography.stat-value}`, label in `{typography.rollup-label}`.
  let { value, label }: { value: string; label: string } = $props();
</script>

<div class="stat">
  <span class="value">{value}</span>
  <span class="label">{label}</span>
</div>

<style>
  .stat {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--space-5) var(--space-6);
  }

  .value {
    font-family: var(--type-stat-value-font-family);
    font-size: var(--type-stat-value-size);
    font-weight: var(--type-stat-value-weight);
    font-variant-numeric: var(--type-stat-value-font-variant-numeric);
    color: var(--text-primary);
  }

  .label {
    font-family: var(--type-rollup-label-font-family);
    font-size: var(--type-rollup-label-size);
    font-weight: var(--type-rollup-label-weight);
    letter-spacing: var(--type-rollup-label-letter-spacing);
    color: var(--text-secondary);
    text-transform: uppercase;
  }
</style>
