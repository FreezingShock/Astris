import { describe, expect, it } from 'vitest';
import { COLLECT_CAP, Collection, SEEDS, place, tierFor } from '../../src/sky';
import type { CollectionStore } from '../../src/sky';
import { SUBJECTS } from '../../src/styles';

class MemoryStore implements CollectionStore {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

describe('Collection', () => {
  it('collects each article once and lights its region', () => {
    const c = new Collection(null);
    const first = c.visit('Jazz', 'Music');
    expect(first.fresh).toBe(true);
    expect(first.lit).toBe('Music');
    expect(first.unlocked.map((a) => a.id)).toContain('first-light');
    const again = c.visit('Jazz', 'Music');
    expect(again.fresh).toBe(false);
    expect(again.lit).toBeNull();
    expect(c.count).toBe(1);
    expect(c.countIn('Music')).toBe(1);
    expect(c.regionsLit).toBe(1);
  });

  it('tiers regions by how many stars they hold', () => {
    expect([0, 1, 4, 5, 14, 15, 99].map(tierFor)).toEqual([0, 1, 1, 2, 2, 3, 3]);
  });

  it('keeps stars with no region but does not light one', () => {
    const c = new Collection(null);
    const r = c.visit('Mystery', 'Other');
    expect(r.fresh).toBe(true);
    expect(r.lit).toBeNull();
    expect(c.regionsLit).toBe(0);
  });

  it('earns each achievement once, and counts crossings between subjects', () => {
    const c = new Collection(null);
    const got: string[] = [];
    SUBJECTS.slice(0, 4).forEach((s, i) => got.push(...c.visit('A' + i, s).unlocked.map((a) => a.id)));
    expect(got).toContain('three-colours');
    expect(got).toContain('built-environment');
    expect(c.crossings).toBe(3);
    expect(c.visit('A0', SUBJECTS[0] ?? '').unlocked).toEqual([]);
    for (let i = 0; i < 12; i++) c.visit('B' + i, SUBJECTS[i % 2] ?? '');
    expect(c.status().find((a) => a.id === 'bridge-builder')?.at).not.toBeNull();
  });

  it('masters a region at fifteen stars', () => {
    const c = new Collection(null);
    for (let i = 0; i < 15; i++) c.visit('M' + i, 'Music');
    expect(c.tierOf('Music')).toBe(3);
    expect(c.status().find((a) => a.id === 'specialist')?.at).not.toBeNull();
  });

  it('survives a reload and ignores a damaged entry', () => {
    const store = new MemoryStore();
    const a = new Collection(store, () => 42);
    a.visit('Jazz', 'Music');
    a.visit('Zoning', 'Urban planning');
    const b = new Collection(store);
    expect(b.stars.map((s) => s.title)).toEqual(['Jazz', 'Zoning']);
    expect(b.crossings).toBe(1);
    expect(b.status().find((s) => s.id === 'first-light')?.at).toBe(42);
    store.setItem('astris:sky:v1', '{nope');
    expect(new Collection(store).count).toBe(0);
    store.setItem('astris:sky:v1', JSON.stringify({ s: [['x', 1, 2], 'bad', ['ok', 'Music', 5]] }));
    expect(new Collection(store).stars).toEqual([{ title: 'ok', subject: 'Music', at: 5 }]);
  });

  it('stops growing at the cap and reset forgets everything', () => {
    const c = new Collection(null);
    for (let i = 0; i < COLLECT_CAP + 5; i++) c.visit('T' + i, 'Music');
    expect(c.count).toBe(COLLECT_CAP);
    c.reset();
    expect(c.count).toBe(0);
    expect(c.crossings).toBe(0);
  });

  it('offers a seed article for every region', () => {
    for (const s of SUBJECTS) expect(SEEDS[s]).toBeTruthy();
  });
});

describe('place', () => {
  it('is stable and stays inside the right wedge', () => {
    expect(place('Jazz', 'Music')).toEqual(place('Jazz', 'Music'));
    const i = SUBJECTS.indexOf('Music');
    const wedge = (Math.PI * 2) / SUBJECTS.length;
    for (let n = 0; n < 40; n++) {
      const p = place('Star ' + n, 'Music');
      let a = Math.atan2(p.y, p.x) + Math.PI / 2;
      if (a < 0) a += Math.PI * 2;
      expect(a).toBeGreaterThanOrEqual(i * wedge);
      expect(a).toBeLessThanOrEqual((i + 1) * wedge);
      expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(0.93);
    }
  });

  it('puts unknown subjects on the rim', () => {
    expect(Math.hypot(...(Object.values(place('Odd', 'Other')) as [number, number]))).toBeGreaterThan(0.95);
  });
});
