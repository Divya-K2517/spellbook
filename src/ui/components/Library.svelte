<script lang="ts">
  import type { Ui } from '../ui.svelte';

  let { ui }: { ui: Ui } = $props();

  const when = (stamp: number) =>
    new Date(stamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
</script>

<main class="library">
  <header>
    <div class="spark" aria-hidden="true"></div>
    <h1>Firefly Society</h1>
    <p class="dim">
      A dark garden full of fireflies. You shape the world; they decide what to do with it. What happens when
      simple individuals influence their neighbors?
    </p>
    <button class="primary" onclick={() => ui.session.createGarden()}>Begin a new garden</button>
  </header>

  <section aria-label="Saved gardens">
    <h2>Your gardens</h2>
    {#if ui.library.length === 0}
      <p class="dim empty">Nothing saved yet. Shape a garden, then save it and it will wait for you here.</p>
    {:else}
      <ul>
        {#each ui.library as garden (garden.id)}
          {@const layers = garden.data.settings.layers}
          <li class="panel">
            <div class="info">
              <strong>{garden.name}</strong>
              <span class="dim">Saved {when(garden.updatedAt)}</span>
              <span class="chips">
                <span class="chip">{garden.data.fireflies.length} fireflies</span>
                {#if garden.data.terrain.ponds.length > 0}<span class="chip">{garden.data.terrain.ponds.length} pond{garden.data.terrain.ponds.length > 1 ? 's' : ''}</span>{/if}
                {#if garden.data.terrain.bushes.length > 0}<span class="chip">{garden.data.terrain.bushes.length} bush{garden.data.terrain.bushes.length > 1 ? 'es' : ''}</span>{/if}
                <span class="chip on">{layers.social ? 'Society' : layers.movement ? 'Movement' : 'Blinking only'}</span>
              </span>
            </div>
            <div class="buttons">
              <button class="primary" onclick={() => ui.session.openGarden(garden.id)}>Open</button>
              <button class="danger" onclick={() => ui.session.requestDelete(garden.id)} aria-label="Delete {garden.name}">Delete</button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</main>

<style>
  .library { height: 100%; overflow: auto; display: grid; align-content: start; justify-items: center; gap: 2.4rem; padding: 4rem 1.2rem 3rem; }
  header { text-align: center; max-width: 34rem; display: grid; gap: 1rem; justify-items: center; }
  h1 { font-size: clamp(2rem, 5vw, 3rem); }
  .spark {
    width: 14px; height: 14px; border-radius: 50%; background: var(--glow);
    box-shadow: 0 0 18px 6px rgba(217, 255, 106, 0.55); animation: blink 3s ease-in-out infinite;
  }
  @keyframes blink { 0%, 70%, 100% { opacity: 0.25; } 80% { opacity: 1; } }
  section { width: min(40rem, 100%); display: grid; gap: 0.9rem; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.7rem; }
  li { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: 0.9rem 1.1rem; }
  .info { display: grid; gap: 0.3rem; min-width: 0; }
  .chips { display: flex; gap: 0.4rem; flex-wrap: wrap; }
  .buttons { display: flex; gap: 0.5rem; flex-shrink: 0; }
  .empty { margin: 0; }
  @media (prefers-reduced-motion: reduce) { .spark { animation: none; opacity: 1; } }
</style>
