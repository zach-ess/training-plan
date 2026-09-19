<script lang="ts">
  // Story 1.3 -- two-tab navigation shell. Day-List rendering (1.5) and
  // History & Trends content (Epic 3) are out of this story's scope --
  // each tab's content area is an empty/placeholder panel only.
  import TabBar from './lib/components/TabBar.svelte';

  type Tab = 'home' | 'history';

  let activeTab = $state<Tab>('home');

  function handleSelect(tab: Tab) {
    // Re-tap-to-reset (EXPERIENCE.md) is intentionally not implemented here
    // -- there is no real Home/History content yet for "reset" to act on.
    // A later story can add that behavior on top of this handler.
    activeTab = tab;
  }
</script>

<main>
  {#if activeTab === 'home'}
    <section aria-label="Home">
      <p>Home placeholder -- Day-List rendering arrives in Story 1.5.</p>
    </section>
  {:else}
    <section aria-label="History &amp; Trends">
      <p>History &amp; Trends placeholder -- content arrives in Epic 3.</p>
    </section>
  {/if}
</main>

<TabBar {activeTab} onSelect={handleSelect} />

<style>
  main {
    background: var(--background);
    color: var(--text-primary);
    padding: var(--space-7);
    padding-bottom: var(--tab-bar-height);
  }

  p {
    font-family: var(--type-body-font-family);
    font-size: var(--type-body-size);
    font-weight: var(--type-body-weight);
    line-height: var(--type-body-line-height);
  }
</style>
