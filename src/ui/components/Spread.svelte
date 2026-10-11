<script lang="ts">
  import type { RuneKind } from '@core/circuit';
  import { useApp } from '../appContext.svelte';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import Editor from './Editor.svelte';
  import MarginNotes from './MarginNotes.svelte';
  import Palette from './Palette.svelte';
  import SceneView from './SceneView.svelte';

  const app = useApp();
  const mode = $derived(app.state.snapshot.state);
  const page = $derived(app.state.page);
  const dirty = $derived((app.state.snapshot.vars.dirty ?? 0) > 0);

  let armed = $state<RuneKind | null>(null);
  $effect(() => {
    if (mode !== 'editing') armed = null;
  });

  function download() {
    const file = app.controller.exportCurrentPage();
    if (!file) return;
    const url = URL.createObjectURL(new Blob([file.text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = file.filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  const modeLabel: Record<string, string> = {
    editing: 'Editing',
    validating: 'Checking',
    invalid: 'Needs fixing',
    preview: 'Running',
    tracing: 'Tracing',
    saving: 'Saving',
    'save-error': 'Save failed',
  };
</script>

<div class="desk">
  <div class="book">
    <header class="bar">
      <button
        class="btn small"
        disabled={!app.can('return-to-library') && mode !== 'editing'}
        onclick={() => app.controller.requestReturnToLibrary()}
      >
        ← Library
      </button>

      <input
        class="title"
        aria-label="Spell title"
        value={page?.title ?? ''}
        disabled={mode !== 'editing'}
        onchange={(event) => app.controller.renameCurrentPage(event.currentTarget.value)}
      />

      <span class="status" class:dirty>
        {modeLabel[mode] ?? mode}{dirty ? ' · unsaved' : ''}
      </span>

      <div class="spacer"></div>

      {#if mode === 'preview'}
        <button class="btn small" onclick={() => app.controller.stopPreview()}>Stop</button>
        <button
          class="btn small primary"
          disabled={!app.can('explain-spell')}
          onclick={() => app.controller.explainSpell()}
        >
          Trace the spell
        </button>
      {:else if mode === 'tracing'}
        <button class="btn small" onclick={() => app.controller.closeExplanation()}>Close trace</button>
      {:else}
        <button class="btn small" disabled={mode !== 'editing'} onclick={download}>Export</button>
        <button
          class="btn small"
          disabled={!app.can('save-page')}
          onclick={() => app.controller.savePage()}
        >
          Save
        </button>
        <button
          class="btn small"
          disabled={!app.can('request-validation')}
          onclick={() => app.controller.requestValidation()}
        >
          Check spell
        </button>
        <button
          class="btn small primary"
          disabled={!app.can('run-spell')}
          title={app.can('run-spell') ? 'Run the spell' : 'Check the spell first'}
          onclick={() => app.controller.runSpell()}
        >
          Run spell
        </button>
      {/if}
    </header>

    {#if mode === 'save-error'}
      <div class="banner" role="alert">
        <span>The page could not be saved{app.state.saveError ? `: ${app.state.saveError}` : '.'}</span>
        <button class="btn small" onclick={() => app.controller.retrySave()}>Try again</button>
        <button class="btn small" onclick={() => app.controller.returnToEditorAfterSaveError()}>
          Back to editing
        </button>
      </div>
    {/if}

    <div class="pages">
      <section class="page left">
        <SceneView />
        <MarginNotes />
      </section>
      <div class="spine" aria-hidden="true"></div>
      <section class="page right">
        <Palette bind:armed disabled={mode !== 'editing'} />
        <div class="canvas-wrap">
          <Editor bind:armed />
        </div>
      </section>
    </div>
  </div>
</div>

{#if app.state.discardPromptOpen}
  <ConfirmDialog
    title="Leave without saving?"
    body="This page has changes that have not been saved. If you leave now they will be lost."
    confirmLabel="Discard changes"
    cancelLabel="Keep editing"
    danger
    onconfirm={() => app.controller.confirmDiscardAndReturn()}
    oncancel={() => app.controller.cancelDiscardPrompt()}
  />
{/if}

<style>
  .desk {
    height: 100%;
    display: grid;
    place-items: center;
    padding: var(--space-4);
  }
  .book {
    width: min(82rem, 100%);
    height: min(50rem, 100%);
    display: flex;
    flex-direction: column;
    background: var(--color-cover);
    border-radius: var(--radius-md);
    padding: var(--space-3);
    box-shadow: var(--shadow-page);
  }
  .bar {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: 0 var(--space-2) var(--space-3);
    color: var(--color-paper);
  }
  .bar .btn:not(.primary) {
    background: var(--color-paper);
    color: var(--color-ink);
  }
  .title {
    min-width: 8rem;
    font-family: var(--font-display);
    font-size: var(--text-lg);
    color: var(--color-paper);
    background: transparent;
    border: 0;
    border-bottom: 1px dashed var(--color-paper-edge);
    padding: var(--space-1) var(--space-2);
  }
  .title:disabled {
    opacity: 1;
    border-bottom-color: transparent;
  }
  .status {
    font-size: var(--text-sm);
    font-style: italic;
    color: var(--color-paper-edge);
  }
  .status.dirty {
    color: var(--color-signal-on-glow);
  }
  .spacer {
    flex: 1;
  }
  .banner {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-2);
    padding: var(--space-2) var(--space-4);
    background: var(--color-danger-wash);
    color: var(--color-paper);
    border: 1px solid var(--color-danger);
    border-radius: var(--radius-sm);
  }
  .banner span {
    flex: 1;
  }
  .pages {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 1fr 14px 1.5fr;
    background: var(--color-paper);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    min-width: 0;
    min-height: 0;
    padding: var(--space-5);
    background: linear-gradient(90deg, var(--color-paper), var(--color-paper-shade));
    overflow-y: auto;
  }
  .page.right {
    background: linear-gradient(270deg, var(--color-paper), var(--color-paper-shade));
    overflow: hidden;
  }
  .spine {
    background: linear-gradient(90deg, rgba(0, 0, 0, 0.18), rgba(0, 0, 0, 0.02) 50%, rgba(0, 0, 0, 0.18));
  }
  .canvas-wrap {
    flex: 1;
    min-height: 0;
    border: 1px solid var(--color-paper-edge);
    border-radius: var(--radius-md);
    background: var(--color-paper);
  }
</style>
