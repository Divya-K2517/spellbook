<script lang="ts">
  import { useApp } from '../appContext.svelte';
  import ConfirmDialog from './ConfirmDialog.svelte';

  const app = useApp();
  const pages = $derived(app.state.library);
  const pendingDelete = $derived(
    app.state.pendingDeleteId ? pages.find((page) => page.id === app.state.pendingDeleteId) : undefined,
  );

  let fileInput: HTMLInputElement;

  function rename(id: string, current: string) {
    const next = window.prompt('Name this spell', current);
    if (next !== null) void app.controller.renameSavedPage(id, next);
  }

  async function importFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) await app.controller.importPage(await file.text());
    input.value = '';
  }

  const formatDate = (time: number) =>
    new Date(time).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
</script>

<main class="library">
  <header>
    <h1>Logic Spellbook</h1>
    <p>Bind runes together with glowing ink and watch the page respond.</p>
  </header>

  <div class="actions">
    <button class="btn primary" onclick={() => app.controller.createNewPage()}>New spell</button>
    <button class="btn" onclick={() => fileInput.click()}>Import page…</button>
    <input
      bind:this={fileInput}
      type="file"
      accept=".json,application/json"
      class="sr-only"
      onchange={importFile}
      tabindex="-1"
    />
  </div>

  {#if !app.state.libraryLoaded}
    <p class="empty">Opening the book…</p>
  {:else if pages.length === 0}
    <p class="empty">The book is empty. Start a new spell to write its first page.</p>
  {:else}
    <ul class="pages">
      {#each pages as page (page.id)}
        <li class="card">
          <button class="open" onclick={() => app.controller.openSavedPage(page.id)}>
            <span class="title">{page.title}</span>
            <span class="meta">
              {page.runes.length} rune{page.runes.length === 1 ? '' : 's'} · {formatDate(page.updatedAt)}
            </span>
          </button>
          <div class="card-actions">
            <button class="btn small" onclick={() => rename(page.id, page.title)}>Rename</button>
            <button class="btn small" onclick={() => app.controller.duplicateSavedPage(page.id)}>
              Duplicate
            </button>
            <button class="btn small danger" onclick={() => app.controller.requestDeletePage(page.id)}>
              Delete
            </button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</main>

{#if pendingDelete}
  <ConfirmDialog
    title="Tear out this page?"
    body={`“${pendingDelete.title}” will be gone for good. This cannot be undone.`}
    confirmLabel="Tear it out"
    cancelLabel="Keep it"
    danger
    onconfirm={() => app.controller.confirmDeletePage()}
    oncancel={() => app.controller.cancelDelete()}
  />
{/if}

<style>
  .library {
    height: 100%;
    overflow-y: auto;
    padding: var(--space-6) var(--space-5);
    max-width: 56rem;
    margin: 0 auto;
    color: var(--color-paper);
  }
  header {
    margin-bottom: var(--space-5);
  }
  h1 {
    font-size: var(--text-xl);
    letter-spacing: 0.02em;
  }
  header p {
    margin: var(--space-2) 0 0;
    color: var(--color-paper-edge);
    font-style: italic;
  }
  .actions {
    display: flex;
    gap: var(--space-3);
    margin-bottom: var(--space-5);
  }
  .empty {
    color: var(--color-paper-edge);
    font-style: italic;
  }
  .pages {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
    gap: var(--space-4);
  }
  .card {
    display: flex;
    flex-direction: column;
    background: var(--color-paper);
    color: var(--color-ink);
    border: 1px solid var(--color-paper-edge);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-page);
    overflow: hidden;
  }
  .open {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-5) var(--space-4);
    text-align: left;
    border: 0;
    background: transparent;
  }
  .open:hover {
    background: var(--color-paper-shade);
  }
  .title {
    font-family: var(--font-display);
    font-size: var(--text-lg);
  }
  .meta {
    color: var(--color-ink-soft);
    font-size: var(--text-sm);
  }
  .card-actions {
    display: flex;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border-top: 1px solid var(--color-paper-edge);
    background: var(--color-paper-shade);
  }
</style>
