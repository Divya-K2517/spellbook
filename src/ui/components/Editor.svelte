<script lang="ts">
  import { gsap } from 'gsap';
  import { runeSpec, type Rune, type RuneKind } from '@core/circuit';
  import { useApp } from '../appContext.svelte';
  import { runeName } from '../copy';
  import { CANVAS, RUNE, clampToCanvas, inkPathData, inputPort, outputPort, type Point } from '../render/geometry';

  interface Props {
    armed: RuneKind | null;
  }

  let { armed = $bindable(null) }: Props = $props();

  const app = useApp();
  const mode = $derived(app.state.snapshot.state);
  const page = $derived(app.state.page);
  const editable = $derived(mode === 'editing');
  const display = $derived(app.display);
  const selection = $derived(app.state.selection);
  const validation = $derived(app.state.validation);

  // Validation errors highlight the offending runes and ink.
  const flagged = $derived.by(() => {
    const runes = new Set<string>();
    const ink = new Set<string>();
    if (mode === 'invalid' && validation && !validation.ok) {
      for (const error of validation.errors) {
        error.runeIds.forEach((id) => runes.add(id));
        error.inkIds.forEach((id) => ink.add(id));
      }
    }
    return { runes, ink };
  });

  let svg: SVGSVGElement;

  // Transient interaction state. Nothing here touches the page until released.
  let drag = $state<{ id: string; offset: Point; pos: Point; moved: boolean } | null>(null);
  let link = $state<{ from: string; pos: Point } | null>(null);

  function toCanvas(event: { clientX: number; clientY: number }): Point {
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const matrix = svg.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const mapped = point.matrixTransform(matrix.inverse());
    return { x: mapped.x, y: mapped.y };
  }

  function position(rune: Rune): Point {
    return drag && drag.id === rune.id ? drag.pos : rune;
  }

  function onBackgroundClick(event: MouseEvent) {
    if (!editable) return;
    if (armed) {
      const at = clampToCanvas(toCanvas(event));
      app.controller.placeRune(armed, Math.round(at.x), Math.round(at.y));
    } else {
      app.controller.select(null);
    }
  }

  function onRunePointerDown(event: PointerEvent, rune: Rune) {
    event.stopPropagation();
    if (!editable) {
      app.controller.inspectRune(rune.id);
      return;
    }
    app.controller.select({ type: 'rune', id: rune.id });
    const at = toCanvas(event);
    drag = { id: rune.id, offset: { x: rune.x - at.x, y: rune.y - at.y }, pos: { x: rune.x, y: rune.y }, moved: false };
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
  }

  function onRunePointerMove(event: PointerEvent) {
    if (!drag) return;
    const at = toCanvas(event);
    const next = clampToCanvas({ x: at.x + drag.offset.x, y: at.y + drag.offset.y });
    drag = { ...drag, pos: next, moved: drag.moved || Math.hypot(next.x - drag.pos.x, next.y - drag.pos.y) > 1.5 };
  }

  function onRunePointerUp() {
    if (!drag) return;
    const finished = drag;
    drag = null;
    if (finished.moved) {
      app.controller.moveRune(finished.id, Math.round(finished.pos.x), Math.round(finished.pos.y));
    }
  }

  function onPortPointerDown(event: PointerEvent, rune: Rune) {
    if (!editable) return;
    event.stopPropagation();
    link = { from: rune.id, pos: outputPort(rune) };
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
  }

  function onPortPointerMove(event: PointerEvent) {
    if (link) link = { ...link, pos: toCanvas(event) };
  }

  function onPortPointerUp(event: PointerEvent) {
    if (!link) return;
    const from = link.from;
    link = null;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-rune-id]');
    const to = target?.getAttribute('data-rune-id');
    if (to && to !== from) app.controller.connectInk(from, to);
  }

  function onWindowKey(event: KeyboardEvent) {
    const typing = (event.target as HTMLElement | null)?.matches?.('input, textarea');
    if (typing) return;
    if (event.key === 'Escape') {
      armed = null;
      link = null;
      if (editable) app.controller.select(null);
    } else if ((event.key === 'Delete' || event.key === 'Backspace') && editable && selection) {
      event.preventDefault();
      if (selection.type === 'rune') app.controller.deleteRune(selection.id);
      else app.controller.deleteInk(selection.id);
    }
  }

  function onInkClick(event: MouseEvent, inkId: string) {
    event.stopPropagation();
    if (editable) app.controller.select({ type: 'ink', id: inkId });
  }

  function onRuneDoubleClick(rune: Rune) {
    if (!editable || (rune.kind !== 'input' && rune.kind !== 'output')) return;
    const next = window.prompt('Name this rune', rune.label ?? '');
    if (next !== null) app.controller.renameRune(rune.id, next);
  }

  // Signal animation: newly lit ink draws itself, and runes that just changed pulse.
  const reducedMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let previouslyLit = new Set<string>();

  $effect(() => {
    if (!display.showValues) {
      previouslyLit = new Set();
      return;
    }
    const lit = display.litInk;
    const fresh = [...lit].filter((id) => !previouslyLit.has(id));
    previouslyLit = new Set(lit);
    if (!svg || reducedMotion) return;

    for (const id of fresh) {
      const path = svg.querySelector<SVGPathElement>(`[data-ink-id="${id}"] .signal`);
      if (!path) continue;
      const length = path.getTotalLength();
      gsap.fromTo(
        path,
        { strokeDasharray: length, strokeDashoffset: length },
        { strokeDashoffset: 0, duration: 0.6, ease: 'power2.out' },
      );
    }
    for (const id of display.changedRunes) {
      const body = svg.querySelector<SVGGElement>(`[data-rune-id="${id}"] .body`);
      if (body) {
        gsap.fromTo(body, { scale: 1.14, transformOrigin: '50% 50%' }, { scale: 1, duration: 0.5, ease: 'back.out(2)' });
      }
    }
  });
</script>

<svelte:window onkeydown={onWindowKey} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<svg
  bind:this={svg}
  class="canvas"
  class:placing={editable && armed !== null}
  viewBox="0 0 {CANVAS.width} {CANVAS.height}"
  role="img"
  aria-label="Rune editor"
>
  <rect class="background" width={CANVAS.width} height={CANVAS.height} onclick={onBackgroundClick} role="presentation" />

  {#if page}
    <!-- Ink under runes -->
    {#each page.ink as path (path.id)}
      {@const source = page.runes.find((rune) => rune.id === path.from)}
      {@const target = page.runes.find((rune) => rune.id === path.to)}
      {#if source && target}
        {@const d = inkPathData(outputPort(position(source)), inputPort(position(target)))}
        <g
          class="ink"
          class:selected={selection?.type === 'ink' && selection.id === path.id}
          class:flagged={flagged.ink.has(path.id)}
          data-ink-id={path.id}
        >
          <path class="hit" {d} onclick={(event) => onInkClick(event, path.id)} role="presentation" />
          <path class="base" {d} />
          {#if display.litInk.has(path.id)}
            <path class="signal" {d} />
          {/if}
        </g>
      {/if}
    {/each}

    {#if link}
      {@const source = page.runes.find((rune) => rune.id === link?.from)}
      {#if source}
        <path class="ink-draft" d={inkPathData(outputPort(position(source)), link.pos)} />
      {/if}
    {/if}

    <!-- Runes -->
    {#each page.runes as rune (rune.id)}
      {@const spec = runeSpec(rune.kind)}
      {@const at = position(rune)}
      <g
        class="rune kind-{rune.kind}"
        class:selected={selection?.type === 'rune' && selection.id === rune.id}
        class:flagged={flagged.runes.has(rune.id)}
        class:on={display.showValues && display.values[rune.id] === true}
        class:dragging={drag?.id === rune.id}
        data-rune-id={rune.id}
        transform="translate({at.x} {at.y})"
        role="presentation"
        onpointerdown={(event) => onRunePointerDown(event, rune)}
        onpointermove={onRunePointerMove}
        onpointerup={onRunePointerUp}
        onpointercancel={onRunePointerUp}
        ondblclick={() => onRuneDoubleClick(rune)}
      >
        <g class="body">
          <rect x={-RUNE.width / 2} y={-RUNE.height / 2} width={RUNE.width} height={RUNE.height} rx="14" />
          <text class="name" text-anchor="middle" dy="0.35em">{runeName(rune)}</text>
          {#if display.showValues}
            <text class="state" text-anchor="middle" y={RUNE.height / 2 - 8}>
              {display.values[rune.id] === true ? 'on' : 'off'}
            </text>
          {/if}
        </g>
        {#if spec.maxInputs > 0}
          <circle class="port in" cx={-RUNE.width / 2} cy="0" r="6" />
        {/if}
        {#if spec.hasOutput}
          <circle
            class="port out"
            cx={RUNE.width / 2}
            cy="0"
            r="7"
            role="presentation"
            onpointerdown={(event) => onPortPointerDown(event, rune)}
            onpointermove={onPortPointerMove}
            onpointerup={onPortPointerUp}
            onpointercancel={onPortPointerUp}
          />
        {/if}
      </g>
    {/each}

    {#if page.runes.length === 0}
      <text class="empty" x={CANVAS.width / 2} y={CANVAS.height / 2} text-anchor="middle">
        A blank page. Pick a rune and click here to begin.
      </text>
    {/if}
  {/if}
</svg>

<style>
  .canvas {
    width: 100%;
    height: 100%;
    display: block;
    touch-action: none;
    user-select: none;
  }
  .canvas.placing {
    cursor: crosshair;
  }
  .background {
    fill: transparent;
  }
  .empty {
    fill: var(--color-ink-faint);
    font-style: italic;
    font-size: 20px;
    pointer-events: none;
  }

  /* Ink */
  .ink .hit {
    fill: none;
    stroke: transparent;
    stroke-width: 18;
    cursor: pointer;
  }
  .ink .base {
    fill: none;
    stroke: var(--color-signal-off);
    stroke-width: 3;
    stroke-linecap: round;
    pointer-events: none;
  }
  .ink .signal {
    fill: none;
    stroke: var(--color-signal-on);
    stroke-width: 4;
    stroke-linecap: round;
    pointer-events: none;
    filter: drop-shadow(0 0 4px var(--color-signal-on-glow));
  }
  .ink.selected .base {
    stroke: var(--color-highlight);
    stroke-width: 4;
  }
  .ink.flagged .base {
    stroke: var(--color-danger);
    stroke-dasharray: 6 5;
  }
  .ink-draft {
    fill: none;
    stroke: var(--color-highlight);
    stroke-width: 3;
    stroke-dasharray: 4 6;
    pointer-events: none;
  }

  /* Runes */
  .rune {
    cursor: grab;
  }
  .rune.dragging {
    cursor: grabbing;
  }
  .rune rect {
    fill: var(--tint);
    stroke: var(--color-rune-stroke);
    stroke-width: 2;
  }
  .rune.selected rect {
    stroke: var(--color-highlight);
    stroke-width: 4;
  }
  .rune.flagged rect {
    stroke: var(--color-danger);
    stroke-width: 4;
    stroke-dasharray: 7 4;
  }
  .rune.on rect {
    filter: drop-shadow(0 0 7px var(--color-signal-on-glow));
  }
  .name {
    font-family: var(--font-display);
    font-size: 17px;
    fill: var(--color-ink);
    pointer-events: none;
  }
  .state {
    font-size: 11px;
    fill: var(--color-ink-soft);
    pointer-events: none;
  }
  .rune.on .state {
    fill: var(--color-ink);
    font-weight: 700;
  }
  .port {
    fill: var(--color-paper);
    stroke: var(--color-rune-stroke);
    stroke-width: 2;
  }
  .port.out {
    cursor: crosshair;
  }
  .port.out:hover {
    fill: var(--color-signal-on);
  }
  .kind-input {
    --tint: var(--color-rune-input);
  }
  .kind-output {
    --tint: var(--color-rune-output);
  }
  .kind-or {
    --tint: var(--color-rune-or);
  }
  .kind-and {
    --tint: var(--color-rune-and);
  }
  .kind-not {
    --tint: var(--color-rune-not);
  }
</style>
