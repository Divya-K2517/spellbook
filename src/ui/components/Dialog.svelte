<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    title,
    confirmLabel,
    danger = false,
    onconfirm,
    oncancel,
    children,
  }: {
    title: string;
    confirmLabel: string;
    danger?: boolean;
    onconfirm: () => void;
    oncancel: () => void;
    children: Snippet;
  } = $props();
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && oncancel()} />

<div class="scrim" role="presentation" onclick={oncancel}>
  <div class="dialog panel" role="alertdialog" aria-modal="true" aria-label={title} tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
    <h2>{title}</h2>
    <div class="body">{@render children()}</div>
    <div class="actions">
      <button onclick={oncancel}>Keep it</button>
      <button class={danger ? 'danger' : 'primary'} onclick={onconfirm}>{confirmLabel}</button>
    </div>
  </div>
</div>

<style>
  .scrim {
    position: fixed; inset: 0; display: grid; place-items: center;
    background: rgba(3, 8, 12, 0.66); z-index: 50;
  }
  .dialog { padding: 1.4rem 1.5rem; width: min(26rem, calc(100vw - 2rem)); background: var(--panel-solid); }
  .body { margin: 0.8rem 0 1.2rem; color: var(--dim); line-height: 1.5; }
  .body :global(p) { margin: 0; }
  .body :global(strong) { color: var(--text); }
  .actions { display: flex; justify-content: flex-end; gap: 0.6rem; }
</style>
