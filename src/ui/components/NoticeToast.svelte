<script lang="ts">
  import { useApp } from '../appContext.svelte';
  import { noticeText } from '../copy';

  const app = useApp();
  const notice = $derived(app.state.notice);

  $effect(() => {
    if (!notice) return;
    const timer = setTimeout(() => app.controller.dismissNotice(), 3800);
    return () => clearTimeout(timer);
  });
</script>

{#if notice}
  {#key notice.seq}
    <div class="toast {notice.kind}" role="status" aria-live="polite">
      <span>{noticeText(notice.code, notice.detail)}</span>
      <button class="close" aria-label="Dismiss" onclick={() => app.controller.dismissNotice()}>×</button>
    </div>
  {/key}
{/if}

<style>
  .toast {
    position: fixed;
    left: 50%;
    bottom: var(--space-5);
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-5);
    background: var(--color-paper);
    border: 1px solid var(--color-paper-edge);
    border-left: 4px solid var(--color-highlight);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-page);
    font-style: italic;
    z-index: 50;
    animation: rise var(--duration-ink) ease-out;
  }
  .toast.refusal {
    border-left-color: var(--color-signal-on);
  }
  .toast.error {
    border-left-color: var(--color-danger);
  }
  .close {
    border: 0;
    background: none;
    font-size: var(--text-lg);
    line-height: 1;
    color: var(--color-ink-soft);
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translate(-50%, 10px);
    }
  }
</style>
