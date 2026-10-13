<script lang="ts">
  import { onMount } from 'svelte';
  import { PERSONALITY_IDS, PERSONALITY_RULES, constellation, describePostcard, generateStory, formatClock } from '@core';
  import { GardenRenderer, type RenderOptions } from '@render';
  import type { Ui, Tool } from '../ui.svelte';
  import Dialog from './Dialog.svelte';

  let { ui }: { ui: Ui } = $props();

  let canvas: HTMLCanvasElement;
  let postcardCanvas = $state<HTMLCanvasElement>();
  let renderer: GardenRenderer | undefined;
  let pointer = $state<{ x: number; y: number } | undefined>();
  let dragPond = $state<{ x: number; y: number; r: number } | undefined>();

  const session = $derived(ui.session);
  const shaping = $derived(ui.state === 'shaping');
  const observing = $derived(ui.state === 'observing');
  const viewing = $derived(ui.state === 'story' || ui.state === 'replay' || ui.state === 'postcard');
  const sim = $derived(ui.sim);
  const layers = $derived(ui.layers);
  const followedName = $derived(sim && ui.followed >= 0 ? sim.world.names[ui.followed] : undefined);
  const story = $derived(sim && ui.followed >= 0 && ui.state === 'story' ? generateStory(sim, ui.followed) : []);
  const map = $derived(sim && ui.followed >= 0 && ui.state === 'story' ? constellation(sim, ui.followed) : undefined);
  const card = $derived(sim && ui.state === 'postcard' ? describePostcard(sim) : undefined);

  // Tools are only offered while the garden is paused; the machine refuses edits otherwise.
  const tools: { id: Tool; label: string; hint: string }[] = [
    { id: 'pond', label: 'Pond', hint: 'Drag to draw a pond that separates groups.' },
    { id: 'bush', label: 'Bush', hint: 'Click to place a gathering spot.' },
    { id: 'firefly', label: 'Firefly', hint: 'Click to add a firefly with the chosen rhythm.' },
    { id: 'personality', label: 'Personality', hint: 'Click a firefly to give it the chosen personality.' },
    { id: 'erase', label: 'Erase', hint: 'Click a pond or a bush to remove it.' },
  ];
  const toolHint = $derived(tools.find((t) => t.id === ui.tool)?.hint);

  function positionOf(event: PointerEvent) {
    return renderer!.toGarden(event.clientX, event.clientY);
  }

  function onPointerDown(event: PointerEvent) {
    if (!renderer || !sim) return;
    const p = positionOf(event);
    if (observing) {
      // Click one firefly to follow its life; click empty garden to let go.
      const hit = sim.pick(p.x, p.y, renderer.toGardenLength(26));
      if (hit >= 0) session.follow(hit);
      else if (ui.followed >= 0) session.unfollow();
      return;
    }
    if (!shaping) return;
    canvas.setPointerCapture(event.pointerId);
    switch (ui.tool) {
      case 'pond':
        dragPond = { x: p.x, y: p.y, r: 0 };
        break;
      case 'bush':
        session.placeBush(p.x, p.y);
        break;
      case 'firefly':
        session.addFirefly(ui.rhythm, p.x, p.y);
        break;
      case 'personality': {
        const hit = sim.pick(p.x, p.y, renderer.toGardenLength(26));
        if (hit >= 0) session.assignPersonality(hit, ui.personality);
        break;
      }
      case 'erase':
        if (!session.erasePondAt(p.x, p.y)) session.removeBushAt(p.x, p.y);
        break;
    }
  }

  function onPointerMove(event: PointerEvent) {
    if (!renderer) return;
    pointer = positionOf(event);
    if (dragPond) dragPond = { ...dragPond, r: Math.hypot(pointer.x - dragPond.x, pointer.y - dragPond.y) };
  }

  function onPointerUp() {
    if (dragPond && dragPond.r >= 20) session.drawPond(dragPond.x, dragPond.y, dragPond.r);
    dragPond = undefined;
  }

  onMount(() => {
    renderer = new GardenRenderer(canvas);
    const fit = () => sim && renderer?.resize(sim.width, sim.height);
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);

    let frame = 0;
    let last = performance.now();
    let clock = 0;
    let lastRefresh = 0;
    const loop = (now: number) => {
      // Cap the step so a backgrounded tab does not fast-forward the garden.
      const elapsed = Math.min(0.1, (now - last) / 1000);
      last = now;
      clock += elapsed;
      session.advance(elapsed * ui.speed);
      if (ui.state === 'observing' && now - lastRefresh > 500) {
        lastRefresh = now;
        ui.refresh();
      }

      const current = session.sim;
      if (current && renderer) {
        const options: RenderOptions = {
          followed: session.followed,
          paused: ui.state !== 'observing',
          pondPreview: dragPond,
          replay:
            ui.state === 'replay' && session.followed >= 0
              ? { index: session.followed, progress: ui.replayProgress }
              : undefined,
          ghost:
            shaping && pointer && !dragPond && ui.tool !== 'pond'
              ? { kind: ui.tool === 'bush' ? 'bush' : ui.tool === 'firefly' ? 'firefly' : ui.tool === 'erase' ? 'erase' : 'pick', ...pointer }
              : undefined,
        };
        renderer.draw(current, options, clock);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  });

  // Path replay plays itself, then holds on the last frame.
  $effect(() => {
    if (ui.state !== 'replay') return;
    ui.replayProgress = 0;
    const started = performance.now();
    const length = 7000;
    let id = 0;
    const tick = () => {
      ui.replayProgress = Math.min(1, (performance.now() - started) / length);
      if (ui.replayProgress < 1) id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  });

  // The postcard is drawn once into its own canvas when it opens.
  $effect(() => {
    if (card && postcardCanvas && sim && renderer) renderer.drawPostcardOn(postcardCanvas, sim, card);
  });

  const setLayer = (layer: 'movement' | 'social', on: boolean) => session.setLayer(layer, on);
  const leave = () => {
    if (!session.returnToLibrary()) ui.confirmDiscard = ui.dirty;
  };
</script>

<div class="screen">
  <header class="bar panel">
    <button onclick={leave}>← Library</button>
    <div class="title">
      <strong>{ui.name ?? 'New garden'}</strong>
      <span class="chip" class:on={ui.dirty}>{ui.dirty ? 'Unsaved changes' : 'Saved'}</span>
      {#if ui.vars.sync_seen === 1 && observing}<span class="chip on">Fireflies in step</span>{/if}
    </div>
    <div class="actions">
      {#if shaping}
        <button class="primary" onclick={() => session.startSimulation()}>▶ Watch</button>
        <button onclick={() => session.save()} disabled={!ui.dirty && ui.vars.garden_saved === 1}>Save</button>
      {:else if observing}
        <button class="primary" onclick={() => session.pauseToShape()}>⏸ Pause &amp; shape</button>
      {/if}
    </div>
  </header>

  <div class="stage">
    <canvas
      bind:this={canvas}
      class:crosshair={shaping}
      onpointerdown={onPointerDown}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
      onpointerleave={() => (pointer = undefined)}
      aria-label="The garden"
    ></canvas>

    {#if viewing}
      <div class="overlay panel">
        {#if ui.state === 'story' && followedName}
          <h2>{followedName}'s night</h2>
          <ul class="story">{#each story as line}<li>{line}</li>{/each}</ul>
          {#if map && map.nodes.length > 0}
            <h3>Closest companions <span class="dim">by {map.basis}</span></h3>
            <svg viewBox="-110 -90 220 180" class="constellation" role="img" aria-label="Relationship map">
              {#each map.nodes as node, k}
                {@const angle = (k / map.nodes.length) * Math.PI * 2 - Math.PI / 2}
                {@const x = Math.cos(angle) * 78}
                {@const y = Math.sin(angle) * 62}
                <line x1="0" y1="0" x2={x} y2={y} stroke="#d9ff6a" stroke-opacity={0.2 + 0.7 * node.weight} stroke-width={0.8 + 2.6 * node.weight} />
                <circle cx={x} cy={y} r={3 + 4 * node.weight} fill="#d9ff6a" opacity={0.5 + 0.5 * node.weight} />
                <text x={x} y={y + (y > 0 ? 17 : -11)} text-anchor="middle" font-size="9.5" fill="#e8f5e0">{node.name}</text>
              {/each}
              <circle r="7" fill="#fff" />
              <text y="-12" text-anchor="middle" font-size="10" font-weight="700" fill="#e8f5e0">{followedName}</text>
            </svg>
          {/if}
          <div class="row"><button class="primary" onclick={() => session.closeStory()}>Back to the garden</button></div>
        {:else if ui.state === 'replay' && followedName}
          <h2>{followedName}'s path</h2>
          <p class="dim">Replaying where {followedName} went, in the garden behind this card.</p>
          <div class="row">
            <button onclick={() => (ui.replayProgress = 0)}>Replay</button>
            <button class="primary" onclick={() => session.closePathReplay()}>Back to the garden</button>
          </div>
        {:else if ui.state === 'postcard' && card}
          <h2>{card.title}</h2>
          <canvas bind:this={postcardCanvas} width="640" height="410" class="postcard"></canvas>
          {#each card.lines as line}<p>{line}</p>{/each}
          <div class="row"><button class="primary" onclick={() => session.closePostcard()}>Back to the garden</button></div>
        {/if}
      </div>
    {/if}
  </div>

  <aside class="side panel">
    {#if shaping}
      <section>
        <h3>Shape the world</h3>
        <div class="tools" role="group" aria-label="Tools">
          {#each tools as tool}
            <button class:selected={ui.tool === tool.id} onclick={() => (ui.tool = tool.id)}>{tool.label}</button>
          {/each}
        </div>
        <p class="dim small">{toolHint}</p>
        {#if ui.tool === 'firefly'}
          <label class="field">Rhythm: one flash every {ui.rhythm.toFixed(1)} s
            <input type="range" min="1.5" max="6" step="0.1" bind:value={ui.rhythm} />
          </label>
        {:else if ui.tool === 'personality'}
          <label class="field">Personality
            <select bind:value={ui.personality}>
              {#each PERSONALITY_IDS as id}<option value={id}>{PERSONALITY_RULES[id].label}</option>{/each}
            </select>
          </label>
          <p class="dim small">{PERSONALITY_RULES[ui.personality].blurb}</p>
        {/if}
      </section>
    {/if}

    <section>
      <h3>Layers</h3>
      <p class="dim small">Blinking is always on. Each layer builds on the one below it.</p>
      <label class="check">
        <input type="checkbox" checked disabled /> Blinking rhythms
      </label>
      <label class="check">
        <input type="checkbox" checked={layers?.movement} disabled={!shaping || layers?.social} onchange={(e) => setLayer('movement', e.currentTarget.checked)} />
        Movement
      </label>
      <label class="check">
        <input type="checkbox" checked={layers?.social} disabled={!shaping || !layers?.movement} onchange={(e) => setLayer('social', e.currentTarget.checked)} />
        Society
      </label>
      {#if shaping && !layers?.movement}<p class="dim small">Turn on movement to unlock society.</p>{/if}
    </section>

    <section>
      <h3>Vision</h3>
      <label class="field">Fireflies see {Math.round(ui.vision)} units
        <input type="range" min="40" max="320" step="5" value={ui.vision} oninput={(e) => session.setVision(Number(e.currentTarget.value))} disabled={!shaping && !observing} />
      </label>
    </section>

    {#if observing}
      <section>
        <h3>Watching</h3>
        <label class="field">Speed ×{ui.speed.toFixed(1)}
          <input type="range" min="0.5" max="4" step="0.5" bind:value={ui.speed} />
        </label>
        <button disabled={!session.can('lift-barrier') && !session.can('restore-barrier')} onclick={() => (session.can('restore-barrier') ? session.restoreBarrier() : session.liftBarrier())}>
          {ui.vars.barrier_open === 1 ? 'Put the pond back' : 'Lift the pond for a while'}
        </button>
        <button onclick={() => session.openPostcard()} disabled={!session.can('open-postcard')}>Nightly postcard</button>
        <p class="dim small">Time: {formatClock(ui.clock.time)} · {ui.clock.count} fireflies · {ui.clock.groups} group{ui.clock.groups === 1 ? '' : 's'} in step</p>
      </section>

      <section>
        <h3>Following</h3>
        {#if followedName && sim}
          <p><strong>{followedName}</strong> <span class="dim">· {sim.ruleOf(ui.followed).label}</span></p>
          <div class="tools">
            <button onclick={() => session.openStory()} disabled={!session.can('open-story')}>Read its story</button>
            <button onclick={() => session.openPathReplay()} disabled={!session.can('open-path-replay')}>Replay its path</button>
            <button onclick={() => session.unfollow()}>Let go</button>
          </div>
        {:else}
          <p class="dim small">Click a firefly to follow its life. A ring around it fills as its next flash approaches.</p>
        {/if}
      </section>
    {/if}

    {#if ui.state === 'save-error'}
      <section class="error">
        <h3>That did not save</h3>
        <p class="small">{ui.saveError ?? 'Unknown problem.'} Your garden is still here.</p>
        <div class="tools">
          <button class="primary" onclick={() => session.retrySave()}>Try again</button>
          <button onclick={() => session.returnToShapingAfterSaveError()}>Keep editing</button>
        </div>
      </section>
    {/if}
    {#if ui.state === 'saving'}<p class="dim">Saving…</p>{/if}
  </aside>
</div>

{#if ui.confirmDiscard}
  <Dialog
    title="Leave without saving?"
    confirmLabel="Discard changes"
    danger
    onconfirm={() => { ui.confirmDiscard = false; session.discardAndReturn(); }}
    oncancel={() => (ui.confirmDiscard = false)}
  >
    <p>This garden has changes that were never saved. If you leave now they will be lost.</p>
  </Dialog>
{/if}

<style>
  .screen { height: 100%; display: grid; grid-template-columns: 1fr 19rem; grid-template-rows: auto 1fr; gap: 0.8rem; padding: 0.8rem; }
  .bar { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.55rem 0.8rem; }
  .title { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; min-width: 0; }
  .actions { display: flex; gap: 0.5rem; }
  .stage { position: relative; min-height: 0; min-width: 0; }
  canvas { width: 100%; height: 100%; display: block; touch-action: none; }
  canvas.crosshair { cursor: crosshair; }
  .side { padding: 0.9rem; overflow: auto; display: grid; align-content: start; gap: 1.1rem; }
  section { display: grid; gap: 0.55rem; }
  h3 { font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--dim); }
  .tools { display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .small { font-size: 0.85rem; margin: 0; }
  .field { display: grid; gap: 0.35rem; font-size: 0.9rem; }
  .check { display: flex; align-items: center; gap: 0.5rem; }
  .check input { accent-color: var(--glow); width: 1rem; height: 1rem; }
  .error { border: 1px solid rgba(255, 138, 122, 0.4); border-radius: 10px; padding: 0.7rem; }
  .overlay {
    position: absolute; inset: 0; margin: auto; width: min(30rem, calc(100% - 2rem));
    height: fit-content; max-height: calc(100% - 2rem); overflow: auto; padding: 1.2rem 1.3rem;
    display: grid; gap: 0.8rem; background: rgba(8, 18, 24, 0.94);
  }
  .overlay p { margin: 0; }
  .story { margin: 0; padding-left: 1.1rem; display: grid; gap: 0.4rem; line-height: 1.45; }
  .constellation { width: 100%; max-height: 14rem; }
  .postcard { width: 100%; height: auto; border-radius: 10px; }
  .row { display: flex; gap: 0.5rem; justify-content: flex-end; }
  @media (max-width: 860px) {
    .screen { grid-template-columns: 1fr; grid-template-rows: auto minmax(18rem, 1fr) auto; overflow: auto; }
  }
</style>
