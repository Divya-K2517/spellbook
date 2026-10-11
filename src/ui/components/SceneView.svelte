<script lang="ts">
  import { useApp } from '../appContext.svelte';
  import { runeName } from '../copy';
  import { getTheme } from '../themes/placeholder';

  const app = useApp();
  const page = $derived(app.state.page);
  const theme = $derived(getTheme(page?.scene.themeId ?? 'placeholder'));
  const display = $derived(app.display);
  const interactive = $derived(app.state.snapshot.state === 'preview');

  const inputs = $derived(page?.runes.filter((rune) => rune.kind === 'input') ?? []);
  const outputs = $derived(page?.runes.filter((rune) => rune.kind === 'output') ?? []);

  /** A switch's position: live while previewing, the traced round while tracing. */
  function inputOn(id: string): boolean {
    return display.showValues ? display.values[id] === true : false;
  }
  function outputOn(id: string): boolean {
    return display.showValues && display.values[id] === true;
  }
</script>

<section class="scene" aria-label="Miniature scene">
  <h2>The scene</h2>

  <div class="stage">
    <div class="group" aria-label="Inputs">
      {#each inputs as rune (rune.id)}
        <button
          class="token input"
          class:on={inputOn(rune.id)}
          disabled={!interactive}
          aria-pressed={inputOn(rune.id)}
          onclick={() => app.controller.toggleSceneInput(rune.id)}
        >
          <span class="orb"></span>
          <span class="label">{runeName(rune)}</span>
          <span class="status">{display.showValues ? (inputOn(rune.id) ? theme.input.on : theme.input.off) : 'idle'}</span>
        </button>
      {:else}
        <p class="none">No switches yet.</p>
      {/each}
    </div>

    <div class="group" aria-label="Outputs">
      {#each outputs as rune (rune.id)}
        <div class="token output" class:on={outputOn(rune.id)}>
          <span class="object"></span>
          <span class="label">{runeName(rune)}</span>
          <span class="status">{display.showValues ? (outputOn(rune.id) ? theme.output.on : theme.output.off) : 'waiting'}</span>
        </div>
      {:else}
        <p class="none">Nothing to wake yet.</p>
      {/each}
    </div>
  </div>

  <p class="caption">
    {#if interactive}
      Flip the switches and watch the results.
    {:else if app.state.snapshot.state === 'tracing'}
      Paused while the spell is explained.
    {:else}
      Run the spell to bring this page to life.
    {/if}
  </p>
</section>

<style>
  .scene {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-height: 0;
  }
  h2 {
    font-size: var(--text-lg);
  }
  .stage {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-4);
    padding: var(--space-4);
    min-height: 11rem;
    background: var(--color-paper-shade);
    border: 1px dashed var(--color-paper-edge);
    border-radius: var(--radius-md);
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .token {
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-areas: 'icon label' 'icon status';
    align-items: center;
    column-gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    text-align: left;
    background: var(--color-paper);
    border: 1.5px solid var(--color-paper-edge);
    border-radius: var(--radius-md);
  }
  .token:disabled {
    opacity: 1;
    cursor: default;
  }
  button.token:not(:disabled):hover {
    border-color: var(--color-highlight);
  }
  .orb,
  .object {
    grid-area: icon;
    width: 1.6rem;
    height: 1.6rem;
    background: var(--color-signal-off-faint);
    border: 2px solid var(--color-signal-off);
    transition:
      background var(--duration-quick),
      box-shadow var(--duration-quick);
  }
  .orb {
    border-radius: 50%;
  }
  .object {
    border-radius: 4px;
  }
  .on .orb,
  .on .object {
    background: var(--color-signal-on);
    border-color: var(--color-signal-on);
    box-shadow: 0 0 12px var(--color-signal-on-glow);
  }
  .label {
    grid-area: label;
    font-weight: 600;
  }
  .status {
    grid-area: status;
    color: var(--color-ink-soft);
    font-size: var(--text-sm);
    font-style: italic;
  }
  .none {
    margin: 0;
    color: var(--color-ink-faint);
    font-style: italic;
    font-size: var(--text-sm);
  }
  .caption {
    margin: 0;
    color: var(--color-ink-soft);
    font-size: var(--text-sm);
    font-style: italic;
  }
</style>
