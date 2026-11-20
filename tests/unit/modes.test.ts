import { describe, expect, it } from 'vitest';
import { SampleProvider } from '../../src/data';
import { Graph, graphOf, route } from '../../src/modes/graph';
import { PAR_BUDGET, beginRace, hudHtml, par, randomPair, stepRace } from '../../src/modes/race';
import type { DataProvider } from '../../src/types';

/** A provider over a hand-written link table that counts neighbour requests. Links run one way unless listed both ways. */
function fake(links: Record<string, string[]>): DataProvider & { calls: string[] } {
  const calls: string[] = [];
  const titles = Object.keys(links);
  return {
    calls,
    suggest: () => Promise.resolve([]),
    constellation: () => Promise.reject(new Error('not used')),
    summary: () => Promise.reject(new Error('not used')),
    random: () => Promise.resolve(titles[0] ?? ''),
    neighbours: (t) => {
      calls.push(t);
      return links[t] ? Promise.resolve(links[t]) : Promise.reject(new Error('missing'));
    },
  };
}

/** True when every step of the chain is a real one-way link. */
async function clickable(provider: DataProvider, chain: string[]): Promise<boolean> {
  for (let i = 0; i + 1 < chain.length; i++) if (!(await provider.neighbours(chain[i] ?? '')).includes(chain[i + 1] ?? '')) return false;
  return true;
}

/** The true fewest clicks, by a plain breadth-first search with no budget. */
async function trueDistance(provider: DataProvider, from: string, to: string): Promise<number> {
  const depth = new Map([[from, 0]]);
  const queue = [from];
  for (const t of queue) {
    if (t === to) return depth.get(t) ?? 0;
    for (const n of await provider.neighbours(t)) {
      if (depth.has(n)) continue;
      depth.set(n, (depth.get(t) ?? 0) + 1);
      queue.push(n);
    }
  }
  return -1;
}

describe('par', () => {
  const provider = new SampleProvider();

  it('finds the fewest clicks for the main page race', async () => {
    expect(await par(provider, 'Brutalist architecture', 'Jazz')).toBe(4);
  });

  it('is zero for the same article and one for a neighbour', async () => {
    expect(await par(provider, 'Jazz', 'Jazz')).toBe(0);
    expect(await par(provider, 'Jazz', 'Music')).toBe(1);
  });

  it('gives up beyond the depth cap', async () => {
    expect(await par(provider, 'Brutalist architecture', 'Jazz', 3)).toBe(-1);
  });

  it('matches a full breadth-first search across the sample set', async () => {
    const titles = SampleProvider.titles;
    for (let i = 0; i < titles.length; i += 7) {
      const from = titles[i] ?? '';
      const to = titles[(i * 5 + 3) % titles.length] ?? '';
      const truth = await trueDistance(provider, from, to);
      expect(await par(new SampleProvider(), from, to, 4, 1000), from + ' to ' + to).toBe(truth > 4 ? -1 : truth);
    }
  });

  it('stays inside its request budget', async () => {
    const counted = fake(Object.fromEntries(await Promise.all(SampleProvider.titles.map(async (t) => [t, await provider.neighbours(t)] as const))));
    expect(await par(counted, 'Brutalist architecture', 'Jazz')).toBe(4);
    expect(counted.calls.length).toBeLessThanOrEqual(PAR_BUDGET + 4);
    expect(new Set(counted.calls).size).toBe(counted.calls.length);
    const before = counted.calls.length;
    expect(await par(counted, 'Brutalist architecture', 'Jazz')).toBe(4);
    expect(counted.calls.length).toBe(before);
  });
});

describe('route', () => {
  const opt = { maxDepth: 4, budget: 100 };

  it('never returns a chain with a step that cannot be clicked', async () => {
    // B links to A, but A does not link to B: the short way round exists in one direction only.
    const provider = fake({ A: ['C'], B: ['A', 'Z'], C: ['D'], D: ['Z'], Z: ['B'] });
    const chain = await route(new Graph(provider), 'A', 'Z', opt);
    expect(chain).toEqual(['A', 'C', 'D', 'Z']);
    expect(await clickable(provider, chain ?? [])).toBe(true);
  });

  it('returns null when the only chain runs the wrong way', async () => {
    expect(await route(new Graph(fake({ A: [], Z: ['A'] })), 'A', 'Z', opt)).toBeNull();
  });

  it('treats a missing article as a dead end', async () => {
    expect(await route(new Graph(fake({ A: ['Gone'] })), 'A', 'Z', opt)).toBeNull();
  });

  it('finds nothing with no budget, and never claims a chain it has not checked', async () => {
    const provider = fake({ A: ['B'], B: ['Z'], Z: ['B'] });
    expect(await route(new Graph(provider), 'A', 'Z', { maxDepth: 4, budget: 0 })).toBeNull();
    expect(await route(new Graph(provider), 'A', 'Z', opt)).toEqual(['A', 'B', 'Z']);
  });
});

describe('randomPair', () => {
  it('picks pairs three or four clicks apart, with a par that a real chain meets', async () => {
    for (let i = 0; i < 200; i++) {
      const provider = new SampleProvider();
      const pair = await randomPair(provider);
      expect(pair.start).not.toBe(pair.target);
      expect(pair.par).toBeGreaterThanOrEqual(3);
      expect(pair.par).toBeLessThanOrEqual(4);
      const truth = await trueDistance(provider, pair.start, pair.target);
      expect(truth).toBeGreaterThan(0);
      expect(pair.par).toBeGreaterThanOrEqual(truth);
    }
  });

  it('asks for a handful of articles, not a search per candidate', async () => {
    const sample = new SampleProvider();
    const counted = fake(Object.fromEntries(await Promise.all(SampleProvider.titles.map(async (t) => [t, await sample.neighbours(t)] as const))));
    counted.random = () => sample.random();
    await randomPair(counted);
    expect(counted.calls.length).toBeLessThanOrEqual(3 * (16 + 8 + 4));
    expect(graphOf(counted)).toBe(graphOf(counted));
  });
});

describe('a race', () => {
  it('starts, counts clicks, finishes on the target and can start again', () => {
    const race = beginRace('A', 'Z', 2, 1000);
    expect(hudHtml(race)).toContain('A → <em>Z</em>');
    expect(stepRace(race, 'B', 1500)).toBe(false);
    expect(race.done).toBe(false);
    expect(stepRace(race, 'Z', 3000)).toBe(true);
    expect(race).toMatchObject({ clicks: 2, time: 2000, done: true });
    expect(hudHtml(race)).toContain('Arrived at <em>Z</em>');
    expect(stepRace(race, 'Q', 4000)).toBe(false);
    expect(race.clicks).toBe(2);
    expect(beginRace(race.start, race.target, race.par, 5000)).toMatchObject({ clicks: 0, done: false, par: 2, t0: 5000 });
  });

  it('says so while par is still being searched for, and when none was found', () => {
    expect(hudHtml(beginRace('A', 'Z', null, 0))).toContain('finding par…');
    expect(hudHtml(beginRace('A', 'Z', -1, 0))).toContain('par unknown');
    expect(hudHtml(beginRace('<b>', 'Z', 3, 0))).toContain('&lt;b&gt;');
  });
});
