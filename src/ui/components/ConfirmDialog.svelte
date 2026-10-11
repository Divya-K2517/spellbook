<script lang="ts">
  interface Props {
    title: string;
    body: string;
    confirmLabel: string;
    cancelLabel?: string;
    danger?: boolean;
    onconfirm: () => void;
    oncancel: () => void;
  }

  let { title, body, confirmLabel, cancelLabel = 'Keep it', danger = false, onconfirm, oncancel }: Props =
    $props();
</script>

<svelte:window onkeydown={(event) => event.key === 'Escape' && oncancel()} />

<div class="backdrop" role="presentation">
  <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title">
    <h2 id="dialog-title">{title}</h2>
    <p>{body}</p>
    <div class="actions">
      <button class="btn" onclick={oncancel}>{cancelLabel}</button>
      <button class="btn {danger ? 'danger' : 'primary'}" onclick={onconfirm}>{confirmLabel}</button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgba(20, 12, 8, 0.6);
    z-index: 40;
  }
  .dialog {
    width: min(26rem, 90vw);
    padding: var(--space-5);
    background: var(--color-paper);
    border: 1px solid var(--color-paper-edge);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-page);
  }
  h2 {
    font-size: var(--text-lg);
    margin-bottom: var(--space-3);
  }
  p {
    margin: 0 0 var(--space-5);
    color: var(--color-ink-soft);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
  }
</style>
