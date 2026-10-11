<script lang="ts">
  import { ALL_RUNE_KINDS, type RuneKind } from '@core/circuit';
  import { runeBlurbs, runeNames } from '../copy';

  interface Props {
    armed: RuneKind | null;
    disabled: boolean;
  }

  let { armed = $bindable(null), disabled }: Props = $props();
</script>

<div class="palette" role="toolbar" aria-label="Rune palette">
  {#each ALL_RUNE_KINDS as kind (kind)}
    <button
      class="chip kind-{kind}"
      class:armed={armed === kind}
      aria-pressed={armed === kind}
      title={runeBlurbs[kind]}
      {disabled}
      onclick={() => (armed = armed === kind ? null : kind)}
    >
      {runeNames[kind]}
    </button>
  {/each}
  <span class="hint">
    {#if disabled}
      Editing is paused.
    {:else if armed}
      Click the page to place a {runeNames[armed]} rune. Esc to cancel.
    {:else}
      Pick a rune, then click the page.
    {/if}
  </span>
</div>

<style>
  .palette {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    padding-bottom: var(--space-3);
  }
  .chip {
    padding: var(--space-1) var(--space-3);
    border: 1.5px solid var(--color-rune-stroke);
    border-radius: 999px;
    background: var(--tint, var(--color-paper-shade));
  }
  .chip.armed {
    box-shadow: 0 0 0 3px var(--color-highlight);
  }
  .kind-input {
    --tint: var(--color-rune-input);
  }
  .kind-output {
    --tint: var(--color-rune-output);
  }
  .kind-or {
    --tint: var(--color-rune-or);
  }
  .kind-and {
    --tint: var(--color-rune-and);
  }
  .kind-not {
    --tint: var(--color-rune-not);
  }
  .hint {
    flex-basis: 100%;
    font-size: var(--text-sm);
    font-style: italic;
    color: var(--color-ink-soft);
  }
</style>
