<script lang="ts">
  import type { Ui } from './ui.svelte';
  import Library from './components/Library.svelte';
  import GardenScreen from './components/GardenScreen.svelte';
  import Dialog from './components/Dialog.svelte';
  import Toast from './components/Toast.svelte';

  let { ui }: { ui: Ui } = $props();
  const inLibrary = $derived(ui.state === 'library' || ui.state === 'confirming-delete');
</script>

{#if inLibrary}
  <Library {ui} />
{:else}
  <GardenScreen {ui} />
{/if}

{#if ui.state === 'confirming-delete' && ui.pendingDelete}
  <Dialog
    title="Delete this garden?"
    confirmLabel="Delete garden"
    danger
    onconfirm={() => ui.session.confirmDelete()}
    oncancel={() => ui.session.cancelDelete()}
  >
    <p>
      <strong>{ui.pendingDelete.name}</strong> and its {ui.pendingDelete.data.fireflies.length} fireflies will be
      removed from this browser. This cannot be undone.
    </p>
  </Dialog>
{/if}

<Toast {ui} />
