import type { Postcard, Simulation } from '@core';
import { COLORS, groupColor } from './palette';

/** What the renderer is asked to show this frame. It never decides; it only draws. */
export interface RenderOptions {
  /** Index of the followed firefly, or -1. */
  followed: number;
  /** Animated replay of one firefly's path, progress in [0, 1]. */
  replay?: { index: number; progress: number };
  /** A pond being dragged out. */
  pondPreview?: { x: number; y: number; r: number };
  /** A faint marker following the pointer for placement tools. */
  ghost?: { kind: 'bush' | 'firefly' | 'erase' | 'pick'; x: number; y: number };
  /** True while the garden is paused, so glows are drawn at rest. */
  paused: boolean;
}

interface Viewport {
  scale: number;
  offsetX: number;
  offsetY: number;
  cssWidth: number;
  cssHeight: number;
}

const GLOW_SIZE = 96;

/**
 * Draws a simulation onto a canvas. Reads the simulation, never changes it.
 * Glow sprites are rendered once per color and reused, so drawing a firefly
 * is one image draw, not a gradient built every frame.
 */
export class GardenRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private view: Viewport = { scale: 1, offsetX: 0, offsetY: 0, cssWidth: 0, cssHeight: 0 };
  private readonly sprites = new Map<string, HTMLCanvasElement>();
  private gardenWidth = 1000;
  private gardenHeight = 640;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot draw the garden: no 2D canvas.');
    this.ctx = ctx;
  }

  /** Matches the canvas to its on-screen size and fits the garden inside it. */
  resize(gardenWidth: number, gardenHeight: number): void {
    this.gardenWidth = gardenWidth;
    this.gardenHeight = gardenHeight;
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const pad = 16;
    const scale = Math.min((rect.width - pad * 2) / gardenWidth, (rect.height - pad * 2) / gardenHeight);
    this.view = {
      scale: Math.max(0.1, scale),
      offsetX: (rect.width - gardenWidth * scale) / 2,
      offsetY: (rect.height - gardenHeight * scale) / 2,
      cssWidth: rect.width,
      cssHeight: rect.height,
    };
  }

  /** Screen position to garden position. */
  toGarden(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - this.view.offsetX) / this.view.scale,
      y: (clientY - rect.top - this.view.offsetY) / this.view.scale,
    };
  }

  /** Length in screen pixels to length in garden units. */
  toGardenLength(pixels: number): number {
    return pixels / this.view.scale;
  }

  private sprite(color: string): HTMLCanvasElement {
    let sprite = this.sprites.get(color);
    if (!sprite) {
      sprite = document.createElement('canvas');
      sprite.width = sprite.height = GLOW_SIZE;
      const g = sprite.getContext('2d')!;
      const gradient = g.createRadialGradient(GLOW_SIZE / 2, GLOW_SIZE / 2, 0, GLOW_SIZE / 2, GLOW_SIZE / 2, GLOW_SIZE / 2);
      gradient.addColorStop(0, color);
      gradient.addColorStop(0.18, color);
      gradient.addColorStop(0.5, `${color}55`);
      gradient.addColorStop(1, `${color}00`);
      g.fillStyle = gradient;
      g.fillRect(0, 0, GLOW_SIZE, GLOW_SIZE);
      this.sprites.set(color, sprite);
    }
    return sprite;
  }

  draw(sim: Simulation, options: RenderOptions, seconds: number): void {
    const { ctx, canvas, view } = this;
    const dpr = canvas.width / Math.max(1, view.cssWidth);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, view.cssWidth, view.cssHeight);
    ctx.save();
    ctx.translate(view.offsetX, view.offsetY);
    ctx.scale(view.scale, view.scale);

    this.drawGround(ctx);
    this.drawTerrain(ctx, sim, seconds);
    if (options.replay) this.drawReplay(sim, options.replay);
    this.drawFireflies(sim, options);
    if (options.followed >= 0) this.drawFollowed(sim, options.followed);
    if (options.pondPreview) this.drawPondPreview(options.pondPreview);
    if (options.ghost) this.drawGhost(options.ghost);
    ctx.restore();
  }

  private drawGround(ctx: CanvasRenderingContext2D): void {
    const gradient = ctx.createLinearGradient(0, 0, 0, this.gardenHeight);
    gradient.addColorStop(0, COLORS.skyTop);
    gradient.addColorStop(1, COLORS.skyBottom);
    ctx.fillStyle = gradient;
    roundRect(ctx, 0, 0, this.gardenWidth, this.gardenHeight, 18);
    ctx.fill();
    ctx.strokeStyle = COLORS.frame;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  private drawTerrain(ctx: CanvasRenderingContext2D, sim: Simulation, seconds: number): void {
    for (const pond of sim.terrain.ponds) {
      const lifted = sim.terrain.lifted;
      ctx.save();
      ctx.globalAlpha = lifted ? 0.28 : 1;
      const gradient = ctx.createRadialGradient(pond.x, pond.y, pond.r * 0.1, pond.x, pond.y, pond.r);
      gradient.addColorStop(0, COLORS.pondCore);
      gradient.addColorStop(1, COLORS.pondEdge);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(pond.x, pond.y, pond.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = COLORS.pondRipple;
      ctx.lineWidth = 1.2;
      if (lifted) ctx.setLineDash([6, 6]);
      for (let k = 0; k < 2; k++) {
        const ripple = ((seconds * 0.25 + k * 0.5) % 1) * pond.r * 0.9;
        ctx.globalAlpha = (lifted ? 0.28 : 1) * (1 - ripple / (pond.r * 0.9));
        ctx.beginPath();
        ctx.arc(pond.x, pond.y, Math.max(1, ripple), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
    for (const bush of sim.terrain.bushes) {
      for (const [dx, dy, r, color] of [
        [-12, 4, 17, COLORS.bushDark],
        [10, 6, 15, COLORS.bushDark],
        [0, -8, 18, COLORS.bushLight],
      ] as const) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(bush.x + dx, bush.y + dy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawFireflies(sim: Simulation, options: RenderOptions): void {
    const { ctx } = this;
    const w = sim.world;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < w.count; i++) {
      const color = groupColor(w.group[i]!);
      const glow = options.paused ? Math.max(w.glow[i]!, 0.18) : w.glow[i]!;
      const sprite = this.sprite(color);

      // A faint steady ember, so a firefly is findable between flashes.
      ctx.globalAlpha = 0.42;
      const ember = 15;
      ctx.drawImage(sprite, w.x[i]! - ember / 2, w.y[i]! - ember / 2, ember, ember);

      if (glow > 0.02) {
        const size = 22 + 60 * glow;
        ctx.globalAlpha = Math.min(1, glow * 1.1);
        ctx.drawImage(sprite, w.x[i]! - size / 2, w.y[i]! - size / 2, size, size);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawFollowed(sim: Simulation, index: number): void {
    const { ctx } = this;
    const w = sim.world;
    if (index >= w.count) return;
    const x = w.x[index]!;
    const y = w.y[index]!;

    // How far this firefly can see.
    ctx.setLineDash([5, 7]);
    ctx.strokeStyle = COLORS.vision;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, sim.settings.vision, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // The timer, filling toward the next flash.
    const radius = 17;
    ctx.lineWidth = 3;
    ctx.strokeStyle = COLORS.ringTrack;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = COLORS.ring;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(x, y, radius, -Math.PI / 2, -Math.PI / 2 + w.phase[index]! * Math.PI * 2);
    ctx.stroke();
    ctx.lineCap = 'butt';

    ctx.font = '600 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.label;
    ctx.fillText(w.names[index]!, x, y - radius - 10);
  }

  private drawReplay(sim: Simulation, replay: { index: number; progress: number }): void {
    const { ctx } = this;
    const path = sim.log.pathOf(replay.index);
    if (path.length < 2) return;
    const upTo = Math.max(1, Math.floor((path.length - 1) * replay.progress));
    for (let k = 1; k <= upTo; k++) {
      ctx.strokeStyle = `rgba(217, 255, 106, ${0.08 + 0.55 * (k / upTo)})`;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(path[k - 1]!.x, path[k - 1]!.y);
      ctx.lineTo(path[k]!.x, path[k]!.y);
      ctx.stroke();
    }
    const head = path[upTo]!;
    ctx.fillStyle = '#d9ff6a';
    ctx.beginPath();
    ctx.arc(head.x, head.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.label;
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(sim.world.names[replay.index]!, head.x, head.y - 14);
  }

  private drawPondPreview(preview: { x: number; y: number; r: number }): void {
    const { ctx } = this;
    ctx.save();
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = 'rgba(150, 200, 235, 0.8)';
    ctx.fillStyle = 'rgba(60, 120, 170, 0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(preview.x, preview.y, preview.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawGhost(ghost: NonNullable<RenderOptions['ghost']>): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = COLORS.labelDim;
    ctx.fillStyle = ghost.kind === 'firefly' ? '#d9ff6a' : ghost.kind === 'bush' ? COLORS.bushLight : 'transparent';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(ghost.x, ghost.y, ghost.kind === 'firefly' ? 7 : ghost.kind === 'bush' ? 16 : 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  /** Draws the nightly postcard into any canvas: the gathering as it looked. */
  drawPostcardOn(target: HTMLCanvasElement, sim: Simulation, card: Postcard): void {
    const g = target.getContext('2d');
    if (!g) return;
    const { width, height } = target;
    const scale = Math.min(width / this.gardenWidth, height / this.gardenHeight);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, width, height);
    g.save();
    g.translate((width - this.gardenWidth * scale) / 2, (height - this.gardenHeight * scale) / 2);
    g.scale(scale, scale);

    this.drawGround(g);
    this.drawTerrain(g, sim, 0);
    if (card.gathering) {
      g.globalCompositeOperation = 'lighter';
      const sprite = this.sprite(groupColor(0));
      for (const p of card.gathering.points) {
        g.globalAlpha = 0.5;
        g.drawImage(sprite, p.x - 12, p.y - 12, 24, 24);
        g.globalAlpha = 1;
        g.drawImage(sprite, p.x - 36, p.y - 36, 72, 72);
      }
      g.globalCompositeOperation = 'source-over';
    }
    g.restore();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
