<script lang="ts">
  // Story 5.2 -- `unchecked-counter`: how many past planned days are still
  // neither logged nor marked "Missed it", at the top of Home beside the
  // Streak. Coach voice (Epic 5 surfaces only). The number is always part of
  // the text; `--accent-caution` on the number when count > 0 is extra, never
  // the only signal. A plain label, not interactive (like the Streak).
  let { count, todayOpen }: { count: number; todayOpen: boolean } = $props();

  const line = $derived(
    count === 0
      ? 'unchecked. Keep showing up.'
      : count === 1
        ? 'day unchecked. No excuses — log it.'
        : 'days unchecked. Stop hiding from them — log them.',
  );
</script>

<div class="unchecked-counter">
  <p class="unchecked-line">
    <span class="unchecked-count" class:has-unchecked={count > 0}>{count}</span>
    {line}
  </p>
  {#if todayOpen}
    <p class="today-open">Today's still open. Done or missed — own it.</p>
  {/if}
</div>

<style>
  .unchecked-counter {
    margin: 0 0 var(--space-4);
  }

  .unchecked-line,
  .today-open {
    margin: 0;
    font-family: var(--type-body-font-family);
    font-size: var(--type-body-size);
    font-weight: var(--type-body-weight);
    line-height: var(--type-body-line-height);
    color: var(--text-primary);
  }

  .today-open {
    margin-top: var(--space-2);
  }

  .unchecked-count {
    font-family: var(--type-stat-value-font-family);
    font-size: var(--type-stat-value-size);
    font-weight: var(--type-stat-value-weight);
    font-variant-numeric: var(--type-stat-value-font-variant-numeric);
    color: var(--text-primary);
  }

  .unchecked-count.has-unchecked {
    color: var(--accent-caution);
  }
</style>
