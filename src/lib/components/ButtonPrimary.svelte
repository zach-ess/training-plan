<script lang="ts">
  // Story 2.2 -- ButtonPrimary: the Mark Complete/Mark Incomplete toggle
  // (UX-DR10, DESIGN.md's `button-primary` component spec). Purely
  // presentational and stateless -- `WorkoutDetail` owns `completed` and the
  // click behavior (`setCompleted`/Completion Feedback), this component only
  // renders the two states and forwards taps.
  //
  // Two visual states, never a third: unlogged/`!completed` is the solid
  // `button-primary` fill (`{colors.accent-primary}` background,
  // `{colors.surface}` foreground) labeled "Mark Complete"; `completed` is
  // the outline treatment (`{colors.text-primary}` border and text,
  // transparent fill) labeled "Mark Incomplete" -- epic-2-context.md's UX &
  // Interaction Patterns is explicit that the toggled/off state "is an
  // outline treatment, not a second solid color," never a second solid fill.
  //
  // `buttonEl` is `$bindable` so `WorkoutDetail` can read the underlying
  // native `<button>` element (Svelte 5's `bind:this` on a component gives
  // the component instance, not its DOM node, unless the component forwards
  // one itself) -- needed there to extend its Tab-key focus trap to cycle
  // between Back and this button once it's rendered.
  let {
    completed,
    onclick,
    disabled = false,
    buttonEl = $bindable(),
  }: {
    completed: boolean;
    onclick: () => void;
    disabled?: boolean;
    buttonEl?: HTMLButtonElement;
  } = $props();

  const label = $derived(completed ? 'Mark Incomplete' : 'Mark Complete');
</script>

<button
  type="button"
  class="button-primary"
  class:is-complete={completed}
  aria-pressed={completed}
  disabled={disabled}
  bind:this={buttonEl}
  {onclick}
>
  {label}
</button>

<style>
  .button-primary {
    all: unset;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: 3rem; /* 48dp-equivalent minimum tap target */
    padding: var(--space-5) var(--space-7);
    border: 1px solid var(--accent-primary);
    border-radius: var(--radius-sm);
    cursor: pointer;
    background: var(--accent-primary);
    color: var(--surface);
    font-family: var(--type-row-label-font-family);
    font-size: var(--type-row-label-size);
    font-weight: var(--type-row-label-weight);
    font-variant-numeric: var(--type-row-label-font-variant-numeric);
    text-align: center;
  }

  /* The toggled/"logged" state -- outline treatment, not a second solid
     color (epic-2-context.md UX & Interaction Patterns). */
  .button-primary.is-complete {
    border-color: var(--text-primary);
    background: transparent;
    color: var(--text-primary);
  }

  .button-primary:focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: 2px;
  }
</style>
