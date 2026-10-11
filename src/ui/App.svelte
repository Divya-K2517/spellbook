<script lang="ts">
  import type { Controller } from '@app';
  import { provideApp } from './appContext.svelte';
  import Library from './components/Library.svelte';
  import Spread from './components/Spread.svelte';
  import NoticeToast from './components/NoticeToast.svelte';

  let { controller }: { controller: Controller } = $props();

  // svelte-ignore state_referenced_locally
  const app = provideApp(controller);
  const inLibrary = $derived(
    app.state.snapshot.state === 'library' || app.state.snapshot.state === 'confirming-delete',
  );
</script>

{#if inLibrary}
  <Library />
{:else}
  <Spread />
{/if}
<NoticeToast />
