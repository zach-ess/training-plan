<!--
  Story 1.4 -- SkeletonDayRow: cold-load placeholder shown while the first
  Plan fetch is in flight and nothing has ever been cached (never a
  spinner -- EXPERIENCE.md documents cold loads as showing placeholders
  "matching the real row layout... rather than a spinner").

  `DayRowCard` itself doesn't exist until Story 1.5, so this is a
  best-effort approximation of that row's future footprint -- a
  status-chip-sized square plus two title/meta-sized bars -- to be revisited
  once the real card exists. All fills route through existing tokens
  (`--border`, `--surface`) at reduced opacity; no new custom property.
-->
<div class="skeleton-day-row" aria-hidden="true">
  <div class="chip"></div>
  <div class="lines">
    <div class="line line-title"></div>
    <div class="line line-meta"></div>
  </div>
</div>

<style>
  .skeleton-day-row {
    display: flex;
    align-items: center;
    gap: var(--space-5);
    min-height: 3rem; /* 48dp-equivalent, matching DayRowCard's future tap-target floor */
    padding: var(--row-padding) var(--gutter);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }

  .chip {
    flex-shrink: 0;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: var(--radius-xs);
    background: var(--border);
    opacity: 0.6;
  }

  .lines {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .line {
    height: 0.625rem;
    border-radius: var(--radius-xs);
    background: var(--border);
    opacity: 0.6;
  }

  .line-title {
    width: 60%;
  }

  .line-meta {
    width: 35%;
  }
</style>
