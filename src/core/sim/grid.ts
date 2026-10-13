import type { World } from './world';

/**
 * A uniform spatial grid rebuilt each step. Finding a firefly's neighbors
 * touches only nearby cells, so the cost grows with how crowded a firefly's
 * surroundings are, not with how many fireflies exist in the garden.
 */
export class SpatialGrid {
  private cell = 1;
  private cols = 1;
  private rows = 1;
  private start = new Int32Array(2);
  private items = new Int32Array(0);
  private width: number;
  private height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  get bounds(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  /** The largest radius that can be queried correctly. */
  get maxRadius(): number {
    return this.cell;
  }

  rebuild(world: World, cellSize: number): void {
    this.cell = Math.max(1, cellSize);
    this.cols = Math.max(1, Math.ceil(this.width / this.cell));
    this.rows = Math.max(1, Math.ceil(this.height / this.cell));
    const cells = this.cols * this.rows;
    if (this.start.length !== cells + 1) this.start = new Int32Array(cells + 1);
    else this.start.fill(0);
    if (this.items.length < world.count) this.items = new Int32Array(Math.max(world.count, 16));

    for (let i = 0; i < world.count; i++) this.start[this.cellOf(world.x[i]!, world.y[i]!) + 1]!++;
    for (let c = 0; c < cells; c++) this.start[c + 1]! += this.start[c]!;
    const fill = this.start.slice(0, cells);
    for (let i = 0; i < world.count; i++) {
      const c = this.cellOf(world.x[i]!, world.y[i]!);
      this.items[fill[c]!++] = i;
    }
  }

  private cellOf(x: number, y: number): number {
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.cell)));
    const cy = Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.cell)));
    return cy * this.cols + cx;
  }

  /**
   * Calls visit(index, squaredDistance) for every firefly within `radius` of
   * (x, y), excluding nothing: callers skip themselves.
   */
  forEachNear(
    world: World,
    x: number,
    y: number,
    radius: number,
    visit: (index: number, distanceSquared: number) => void,
  ): void {
    if (radius > this.cell + 1e-9) throw new Error(`grid cell ${this.cell} is smaller than query radius ${radius}`);
    const r2 = radius * radius;
    const cx = Math.floor(x / this.cell);
    const cy = Math.floor(y / this.cell);
    for (let gy = Math.max(0, cy - 1); gy <= Math.min(this.rows - 1, cy + 1); gy++) {
      for (let gx = Math.max(0, cx - 1); gx <= Math.min(this.cols - 1, cx + 1); gx++) {
        const c = gy * this.cols + gx;
        for (let k = this.start[c]!; k < this.start[c + 1]!; k++) {
          const j = this.items[k]!;
          const dx = world.x[j]! - x;
          const dy = world.y[j]! - y;
          const d2 = dx * dx + dy * dy;
          if (d2 <= r2) visit(j, d2);
        }
      }
    }
  }
}
