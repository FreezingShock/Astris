import type { Point } from './model';

/**
 * Where every star of the cumulative map sits, in map units.
 * It keeps new stars from landing on old ones and lets a star that was seen before be found again.
 * Pure: no DOM, so it runs in unit tests.
 */
export class World {
  private readonly at = new Map<string, Point>();
  private readonly cells = new Map<string, Set<string>>();

  /** @param gap The least distance between two stars. */
  constructor(private readonly gap: number) {}

  get size(): number {
    return this.at.size;
  }

  get(title: string): Point | undefined {
    return this.at.get(title);
  }

  has(title: string): boolean {
    return this.at.has(title);
  }

  set(title: string, x: number, y: number): void {
    this.delete(title);
    this.at.set(title, { x, y });
    const key = this.key(x, y);
    const cell = this.cells.get(key) ?? new Set<string>();
    cell.add(title);
    this.cells.set(key, cell);
  }

  delete(title: string): void {
    const p = this.at.get(title);
    if (!p) return;
    this.at.delete(title);
    const key = this.key(p.x, p.y);
    const cell = this.cells.get(key);
    cell?.delete(title);
    if (cell && cell.size === 0) this.cells.delete(key);
  }

  clear(): void {
    this.at.clear();
    this.cells.clear();
  }

  /** True when a star already sits within the gap of this point. */
  crowded(x: number, y: number): boolean {
    const cx = Math.floor(x / this.gap);
    const cy = Math.floor(y / this.gap);
    const lim = this.gap * this.gap;
    for (let i = cx - 1; i <= cx + 1; i++) {
      for (let j = cy - 1; j <= cy + 1; j++) {
        const cell = this.cells.get(i + ',' + j);
        if (!cell) continue;
        for (const t of cell) {
          const p = this.at.get(t);
          if (p && (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y) < lim) return true;
        }
      }
    }
    return false;
  }

  /** The nearest free spot to a wanted one, found by stepping away from `from`. The wanted spot itself if it is free. */
  free(x: number, y: number, from: Point): Point {
    if (!this.crowded(x, y)) return { x, y };
    const a = Math.atan2(y - from.y, x - from.x);
    let last = { x, y };
    for (let k = 1; k <= 30; k++) {
      for (const turn of [0, 0.5, -0.5, 1, -1]) {
        const cand = { x: x + Math.cos(a + turn) * k * this.gap * 0.7, y: y + Math.sin(a + turn) * k * this.gap * 0.7 };
        last = cand;
        if (!this.crowded(cand.x, cand.y)) return cand;
      }
    }
    return last;
  }

  private key(x: number, y: number): string {
    return Math.floor(x / this.gap) + ',' + Math.floor(y / this.gap);
  }
}
