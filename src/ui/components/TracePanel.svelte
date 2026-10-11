<script lang="ts">
  import { useApp } from '../appContext.svelte';
  import { describeChange } from '../copy';

  const app = useApp();
  const page = $derived(app.state.page);
  const simulation = $derived(app.state.simulation);
  const rounds = $derived(simulation?.rounds ?? []);
  const current = $derived(app.state.traceRound);
  const round = $derived(rounds[current]);
  const atEnd = $derived(current >= rounds.length - 1);

  let playing = $state(false);

  // Auto-play: advance one round at a time until the last round.
  $effect(() => {
    if (!playing) return;
    if (atEnd) {
      playing = false;
      return;
    }
    const timer = setTimeout(() => app.controller.inspectTraceRound(current + 1), 1100);
    return () => clearTimeout(timer);
  });

  function togglePlay() {
    if (playing) {
      playing = false;
      return;
    }
    if (atEnd) app.controller.inspectTraceRound(0);
    playing = true;
  }

  function go(index: number) {
    playing = false;
    app.controller.inspectTraceRound(index);
  }
</script>

<section class="trace" aria-label="Trace the spell">
  <h2>Tracing the spell</h2>

  {#if page && round}
    <p class="step">
      Step {current + 1} of {rounds.length}
      {#if current === 0}: the switches are set{/if}
    </p>

    <ul class="changes">
      {#each round.changes as change (change.runeId)}
        <li class:on={change.to}>{describeChange(change, page)}</li>
      {:else}
        <li class="quiet">No switches are on, so nothing stirs.</li>
      {/each}
    </ul>

    {#if atEnd}
      <p class="settled">
        {simulation?.settled ? 'The spell has settled.' : 'The spell never settles: it keeps changing.'}
      </p>
    {/if}
  {/if}

  <div class="controls">
    <button class="btn small" onclick={() => go(0)} disabled={current === 0}>Restart</button>
    <button class="btn small" onclick={() => go(current - 1)} disabled={current === 0}>Back</button>
    <button class="btn small primary" onclick={togglePlay}>{playing ? 'Pause' : 'Play'}</button>
    <button class="btn small" onclick={() => go(current + 1)} disabled={atEnd}>Next</button>
  </div>
</section>

<style>
  .trace {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  h2 {
    font-size: var(--text-lg);
  }
  .step {
    margin: 0;
    color: var(--color-ink-soft);
    font-style: italic;
  }
  .changes {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .changes li {
    padding: var(--space-2) var(--space-3);
    background: var(--color-paper-shade);
    border-left: 4px solid var(--color-signal-off);
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
  }
  .changes li.on {
    border-left-color: var(--color-signal-on);
  }
  .quiet {
    font-style: italic;
    color: var(--color-ink-soft);
  }
  .settled {
    margin: 0;
    font-weight: 600;
  }
  .controls {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
</style>
