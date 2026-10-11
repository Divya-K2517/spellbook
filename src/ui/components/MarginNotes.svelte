<script lang="ts">
  import { explainRune } from '@core/simulator';
  import { useApp } from '../appContext.svelte';
  import { runeBlurbs, runeName, validationCopy } from '../copy';
  import TracePanel from './TracePanel.svelte';

  const app = useApp();
  const mode = $derived(app.state.snapshot.state);
  const page = $derived(app.state.page);
  const selection = $derived(app.state.selection);
  const validation = $derived(app.state.validation);
  const display = $derived(app.display);

  const selectedRune = $derived(
    selection?.type === 'rune' ? page?.runes.find((rune) => rune.id === selection.id) : undefined,
  );

  const explanation = $derived(
    page && selectedRune && display.showValues
      ? explainRune(page, display.values, selectedRune.id)
      : undefined,
  );

  function nameOf(id: string): string {
    const rune = page?.runes.find((candidate) => candidate.id === id);
    return rune ? runeName(rune) : 'something';
  }
</script>

<section class="notes" aria-live="polite">
  {#if mode === 'tracing'}
    <TracePanel />
  {:else if mode === 'validating'}
    <h2>Checking the spell…</h2>
    <p class="muted">The book is reading your runes and ink.</p>
  {:else if mode === 'invalid' && validation && !validation.ok}
    <h2>The spell will not hold</h2>
    <ul class="issues">
      {#each validation.errors as error, index (index)}
        {@const copy = validationCopy[error.code]}
        <li>
          <strong>{copy.title}</strong>
          <span>{copy.hint}</span>
        </li>
      {/each}
    </ul>
    <button class="btn primary" onclick={() => app.controller.returnToFixErrors()}>Fix the spell</button>
  {:else if mode === 'preview'}
    <h2>Running</h2>
    {#if selectedRune && explanation}
      <p>
        <strong>{runeName(selectedRune)}</strong> is
        <strong>{explanation.value ? 'on' : 'off'}</strong>.
        {explanation.rule}
      </p>
      {#if explanation.inputs.length > 0}
        <p class="muted">
          It hears:
          {#each explanation.inputs as reading, index (reading.runeId)}
            {index > 0 ? ', ' : ''}{nameOf(reading.runeId)} {reading.value ? 'on' : 'off'}
          {/each}.
        </p>
      {/if}
    {:else}
      <p class="muted">Flip a switch on the left page. Click a rune to ask why it is on or off.</p>
    {/if}
  {:else if mode === 'saving'}
    <h2>Saving…</h2>
    <p class="muted">Writing this page into the book.</p>
  {:else}
    <h2>Margin notes</h2>
    {#if selectedRune}
      <p><strong>{runeName(selectedRune)}</strong>: {runeBlurbs[selectedRune.kind]}</p>
      <div class="row">
        <button class="btn small danger" onclick={() => app.controller.deleteRune(selectedRune.id)}>
          Erase rune
        </button>
      </div>
    {:else if selection?.type === 'ink'}
      <p>A line of ink.</p>
      <div class="row">
        <button class="btn small danger" onclick={() => app.controller.deleteInk(selection.id)}>
          Erase ink
        </button>
      </div>
    {:else}
      <p class="muted">
        Drag from a rune's right-hand dot to another rune to draw ink. Double-click a Switch or
        Result to name it. Select something and press Delete to erase it.
      </p>
    {/if}
    {#if validation?.ok}
      <p class="ok">The spell holds together. It is ready to run.</p>
    {/if}
  {/if}
</section>

<style>
  .notes {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-height: 0;
    overflow-y: auto;
  }
  h2 {
    font-size: var(--text-lg);
  }
  p {
    margin: 0;
  }
  .muted {
    color: var(--color-ink-soft);
    font-style: italic;
  }
  .ok {
    color: var(--color-ok);
    font-weight: 600;
  }
  .issues {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .issues li {
    display: flex;
    flex-direction: column;
    padding: var(--space-2) var(--space-3);
    background: var(--color-danger-wash);
    border-left: 4px solid var(--color-danger);
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
  }
  .issues span {
    color: var(--color-ink-soft);
  }
  .row {
    display: flex;
    gap: var(--space-2);
  }
</style>
