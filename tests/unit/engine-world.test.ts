import { describe, expect, it } from 'vitest';
import { World } from '../../src/engine/world';

describe('World', () => {
  it('remembers where a star is and forgets it', () => {
    const w = new World(10);
    w.set('A', 5, 5);
    expect(w.get('A')).toEqual({ x: 5, y: 5 });
    expect(w.size).toBe(1);
    w.delete('A');
    expect(w.has('A')).toBe(false);
    expect(w.crowded(5, 5)).toBe(false);
  });

  it('leaves a free spot alone and moves a crowded one outward', () => {
    const w = new World(10);
    w.set('A', 0, 0);
    expect(w.free(30, 0, { x: 0, y: 0 })).toEqual({ x: 30, y: 0 });
    const p = w.free(2, 0, { x: -20, y: 0 });
    expect(Math.hypot(p.x, p.y)).toBeGreaterThanOrEqual(10);
    expect(p.x).toBeGreaterThan(2);
  });

  it('packs many stars without any two closer than the gap', () => {
    const w = new World(10);
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < 300; i++) {
      const p = w.free(Math.cos(i) * 40, Math.sin(i) * 40, { x: 0, y: 0 });
      w.set('s' + i, p.x, p.y);
      pts.push(p);
    }
    let close = 0;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) if (Math.hypot(pts[i]!.x - pts[j]!.x, pts[i]!.y - pts[j]!.y) < 10) close++;
    expect(close).toBe(0);
  });
});
