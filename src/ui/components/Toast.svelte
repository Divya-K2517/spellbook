<script lang="ts">
  import type { Ui } from '../ui.svelte';

  let { ui }: { ui: Ui } = $props();

  $effect(() => {
    if (!ui.notice) return;
    const timer = setTimeout(() => ui.session.clearNotice(), 5200);
    return () => clearTimeout(timer);
  });
</script>

{#if ui.notice}
  <div class="toast panel" role="status">{ui.notice}</div>
{/if}

<style>
  .toast {
    position: fixed; left: 50%; bottom: 1.4rem; transform: translateX(-50%);
    padding: 0.7rem 1.1rem; max-width: min(34rem, calc(100vw - 2rem)); z-index: 60;
    background: var(--panel-solid); border-color: rgba(217, 255, 106, 0.35);
  }
</style>
