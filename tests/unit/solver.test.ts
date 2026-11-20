import { describe, expect, it } from 'vitest';
import { solve, type LinkSource } from '../../src/data';

/** An in-memory graph. Links count in both directions, as the solver assumes. */
function graphSource(edges: [string, string][], cut: ReadonlySet<string> = new Set()): LinkSource & { calls: string[] } {
  const adj = new Map<string, Set<string>>();
  for (const [a, b] of edges) {
    (adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(b);
    (adj.get(b) ?? adj.set(b, new Set()).get(b)!).add(a);
  }
  const calls: string[] = [];
  return { calls, links: async (t) => (calls.push(t), { titles: [...(adj.get(t) ?? [])], complete: !cut.has(t) }) };
}

function bfs(edges: [string, string][], from: string, to: string): number {
  const src = new Map<string, string[]>();
  for (const [a, b] of edges) {
    src.set(a, [...(src.get(a) ?? []), b]);
    src.set(b, [...(src.get(b) ?? []), a]);
  }
  const d = new Map([[from, 0]]);
  const q = [from];
  for (let i = 0; i < q.length; i++) {
    const t = q[i] ?? '';
    for (const n of src.get(t) ?? []) {
      if (d.has(n)) continue;
      d.set(n, (d.get(t) ?? 0) + 1);
      q.push(n);
    }
  }
  return d.get(to) ?? -1;
}

const opt = { maxDepth: 8, budget: 1000 };

describe('solve', () => {
  it('handles the same article and neighbours', async () => {
    const g = graphSource([['A', 'B']]);
    expect(await solve(g, 'A', 'A', opt)).toMatchObject({ path: ['A'], length: 0, exact: true });
    expect(await solve(g, 'A', 'B', opt)).toMatchObject({ path: ['A', 'B'], length: 1, exact: true });
  });

  it('prefers the shorter of two routes', async () => {
    const g = graphSource([
      ['A', 'B'],
      ['B', 'C'],
      ['C', 'D'],
      ['D', 'Z'],
      ['A', 'X'],
      ['X', 'Z'],
    ]);
    const s = await solve(g, 'A', 'Z', opt);
    expect(s.path).toEqual(['A', 'X', 'Z']);
    expect(s.exact).toBe(true);
  });

  it('matches a plain breadth-first search on random graphs', async () => {
    let seed = 7;
    const rand = (): number => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    for (let round = 0; round < 40; round++) {
      const n = 30;
      const edges: [string, string][] = [];
      for (let i = 0; i < 45; i++) edges.push(['n' + Math.floor(rand() * n), 'n' + Math.floor(rand() * n)]);
      const from = 'n' + Math.floor(rand() * n);
      const to = 'n' + Math.floor(rand() * n);
      const truth = bfs(edges, from, to);
      const s = await solve(graphSource(edges), from, to, opt);
      expect(s.length, round + ' ' + from + '→' + to).toBe(from === to ? 0 : truth);
      if (s.path) {
        expect(s.path[0]).toBe(from);
        expect(s.path.at(-1)).toBe(to);
      }
    }
  });

  it('reports a proven floor, not a guess, when the budget runs out', async () => {
    const edges: [string, string][] = [
      ['S', 'a1'],
      ['S', 'a2'],
      ['S', 'a3'],
      ['a1', 'b'],
      ['b', 'c'],
      ['c', 'T'],
      ['T', 'z1'],
      ['T', 'z2'],
    ];
    const s = await solve(graphSource(edges), 'S', 'T', { maxDepth: 8, budget: 3 });
    expect(s.path).toBeNull();
    expect(s.exact).toBe(false);
    expect(s.stopped).toBe('budget');
    expect(s.lower).toBeGreaterThanOrEqual(2);
    expect(s.lower).toBeLessThanOrEqual(4);
    expect(s.expansions).toBeLessThanOrEqual(3);
  });

  it('stops at the depth cap and when an end is closed off', async () => {
    const chain: [string, string][] = [
      ['A', 'B'],
      ['B', 'C'],
      ['C', 'D'],
      ['D', 'E'],
    ];
    expect(await solve(graphSource(chain), 'A', 'E', { maxDepth: 3, budget: 99 })).toMatchObject({ path: null, stopped: 'depth', lower: 4 });
    expect(await solve(graphSource([['A', 'B']]), 'A', 'Q', opt)).toMatchObject({ path: null, stopped: 'closed' });
  });

  it('does not claim exact when a list was cut short', async () => {
    const g = graphSource(
      [
        ['A', 'B'],
        ['B', 'C'],
      ],
      new Set(['B']),
    );
    expect(await solve(g, 'A', 'C', opt)).toMatchObject({ length: 2, exact: false, truncated: true });
  });

  it('skips banned edges', async () => {
    const g = graphSource([
      ['A', 'B'],
      ['B', 'Z'],
      ['A', 'C'],
      ['C', 'D'],
      ['D', 'Z'],
    ]);
    const s = await solve(g, 'A', 'Z', { ...opt, banned: (a, b) => (a === 'B' && b === 'Z') || (a === 'Z' && b === 'B') });
    expect(s.path).toEqual(['A', 'C', 'D', 'Z']);
  });

  it('asks for each article once and stops at the first meeting', async () => {
    const g = graphSource([
      ['A', 'B'],
      ['B', 'C'],
      ['C', 'D'],
    ]);
    await solve(g, 'A', 'D', { ...opt, batch: 1 });
    expect(new Set(g.calls).size).toBe(g.calls.length);
    expect(g.calls.length).toBeLessThanOrEqual(3);
  });
});
