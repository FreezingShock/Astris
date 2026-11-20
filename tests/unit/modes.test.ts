import { describe, expect, it } from 'vitest';
import { SampleProvider } from '../../src/data';
import { Connect, chainBetween, connectHtml, type ConnectHost, type ConnectState } from '../../src/modes/connect';
import { DAILY_POOL, bestDaily, dailyPair, dayLabel, dayOf, saveDaily } from '../../src/modes/daily';
import { failureOf } from '../../src/modes/failure';
import { Graph, graphOf, route } from '../../src/modes/graph';
import { closest, suggestNext } from '../../src/modes/panel';
import { PAR_BUDGET, beginRace, verdict, hudHtml, par, solvePar, randomPair, stepRace } from '../../src/modes/race';
import { safeUrl, summaryHtml } from '../../src/modes/summary';
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
      expect(await par(new SampleProvider(), from, to, 4, 1000, Infinity), from + ' to ' + to).toBe(truth > 4 ? -1 : truth);
      // The light search may miss a chain, but one it reports is real, so it is never below the true distance.
      const light = await par(new SampleProvider(), from, to);
      if (light >= 0) expect(light, from + ' to ' + to).toBeGreaterThanOrEqual(truth);
    }
  });

  it('stays inside its request budget', async () => {
    const counted = fake(Object.fromEntries(await Promise.all(SampleProvider.titles.map(async (t) => [t, await provider.neighbours(t)] as const))));
    expect(await par(counted, 'Brutalist architecture', 'Jazz')).toBe(4);
    expect(counted.calls.length).toBeLessThanOrEqual(PAR_BUDGET + 4);
    expect(counted.calls.length * 7).toBeLessThan(100);
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
    expect(counted.calls.length).toBeLessThanOrEqual(3 * (16 + 3 + 4));
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

describe('the article summary in the panel', () => {
  const url = 'https://en.wikipedia.org/wiki/Jazz';
  const full = { title: 'Jazz', extract: 'Jazz is a music genre.', url, thumbnail: 'https://upload.wikimedia.org/jazz.jpg' };

  it('shows the extract, a link to the article and the licence', () => {
    const html = summaryHtml('Jazz', full);
    expect(html).toContain('<b>Jazz</b> is a music genre.');
    expect(html).toContain("<a href='" + url + "' target='_blank' rel='noopener'>Read the full article on Wikipedia</a>");
    expect(html).toContain('https://creativecommons.org/licenses/by-sa/4.0/');
    expect(html).toContain('CC BY-SA 4.0');
  });

  it('links the thumbnail to the article, and leaves it out when there is none', () => {
    expect(summaryHtml('Jazz', full)).toMatch(/<a href='https:\/\/en\.wikipedia\.org\/wiki\/Jazz'[^>]* class='thumb'[^>]*><img src='https:\/\/upload\.wikimedia\.org\/jazz\.jpg'/);
    expect(summaryHtml('Jazz', { ...full, thumbnail: undefined })).not.toContain('<img');
  });

  it('escapes the text and refuses addresses that are not https', () => {
    const html = summaryHtml('Jazz', { title: 'Jazz', extract: '<img onerror=x>', url: 'javascript:alert(1)', thumbnail: "https://x.org/a.jpg' onload='x" });
    expect(html).toContain('&lt;img onerror=x&gt;');
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('<img');
    expect(safeUrl('http://en.wikipedia.org/wiki/Jazz')).toBe('');
    expect(safeUrl(url)).toBe(url);
  });

  it('keeps an apostrophe in a title inside its attribute', () => {
    const html = summaryHtml("Hubble's law", { ...full, title: "Hubble's law" });
    expect(html).toContain('aria-label="Hubble\'s law on Wikipedia"');
  });

  it('says so while loading and when an article has no summary', () => {
    expect(summaryHtml('Jazz', null)).toContain('Fetching the article');
    const empty = summaryHtml('Jazz', { title: 'Jazz', extract: '', url });
    expect(empty).toContain('no summary');
    expect(empty).not.toContain('CC BY-SA');
    expect(summaryHtml('Jazz', { title: 'Jazz', extract: '', url: '' })).not.toContain('<a ');
  });
});

describe('a failed request', () => {
  const named = (name: string): Error => Object.assign(new Error('x'), { name });

  it('is a missing article unless the network, the server or a cancel caused it', () => {
    expect(failureOf(new Error('No article called "Zzqx"'))).toBe('missing');
    expect(failureOf(named('ArticleNotFoundError'))).toBe('missing');
    expect(failureOf(new TypeError('Failed to fetch'))).toBe('unreachable');
    expect(failureOf(named('HttpError'))).toBe('unreachable');
    expect(failureOf(named('AbortError'))).toBe('cancelled');
  });
});

describe('the daily race', () => {
  const day = dayOf(Date.UTC(2026, 10, 20, 15));

  it('is the same pair all day for everyone, and changes with the day', () => {
    expect(dayOf(Date.UTC(2026, 10, 20, 0, 0, 1))).toBe(day);
    expect(dayOf(Date.UTC(2026, 10, 20, 23, 59, 59))).toBe(day);
    expect(dayOf(Date.UTC(2026, 10, 21))).toBe(day + 1);
    expect(dailyPair(day)).toEqual(dailyPair(day));
    expect(dayLabel(day)).toBe('20 Nov');
    const year = new Set(Array.from({ length: 365 }, (_, i) => dailyPair(day + i)).map((p) => p.start + '|' + p.target));
    expect(year.size).toBeGreaterThan(300);
  });

  it('always joins two different subjects with articles the sample set has', () => {
    const group = (t: string): number => DAILY_POOL.findIndex((g) => g.includes(t));
    for (let i = 0; i < 400; i++) {
      const pair = dailyPair(day + i);
      expect(SampleProvider.isReal(pair.start), pair.start).toBe(true);
      expect(SampleProvider.isReal(pair.target), pair.target).toBe(true);
      expect(group(pair.start)).not.toBe(group(pair.target));
    }
    const all = DAILY_POOL.flat();
    expect(new Set(all).size).toBe(all.length);
  });

  it('has a chain on the sample set every day for a year', async () => {
    const provider = new SampleProvider();
    for (let i = 0; i < 365; i++) {
      const pair = dailyPair(day + i);
      expect(await trueDistance(provider, pair.start, pair.target), pair.start + ' to ' + pair.target).toBeGreaterThan(1);
    }
  });

  it('keeps the best finish for the day and survives blocked storage', () => {
    const data = new Map<string, string>();
    const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    expect(bestDaily(day, store)).toBeNull();
    expect(saveDaily(day, { clicks: 5, time: 9000 }, store)).toEqual({ clicks: 5, time: 9000 });
    expect(saveDaily(day, { clicks: 6, time: 1000 }, store)).toEqual({ clicks: 5, time: 9000 });
    expect(saveDaily(day, { clicks: 5, time: 4000 }, store)).toEqual({ clicks: 5, time: 4000 });
    expect(bestDaily(day + 1, store)).toBeNull();
    data.set('astris:daily:' + day, '{broken');
    expect(bestDaily(day, store)).toBeNull();
    const blocked = {
      getItem: (): string | null => null,
      setItem: (): void => {
        throw new Error('blocked');
      },
    };
    expect(saveDaily(day, { clicks: 3, time: 1 }, blocked)).toEqual({ clicks: 3, time: 1 });
    expect(saveDaily(day, { clicks: 3, time: 1 }, undefined)).toEqual({ clicks: 3, time: 1 });
  });

  it('labels its status card and shows the best finish', () => {
    const race = beginRace('A', 'Z', 3, 0, day);
    expect(hudHtml(race)).toContain('Daily constellation · 20 Nov');
    expect(hudHtml(race)).toContain("id='retry'>Restart");
    stepRace(race, 'Z', 61000);
    race.best = { clicks: 1, time: 61000 };
    expect(hudHtml(race)).toContain('your best today 1 click in 01:01');
    expect(hudHtml(beginRace('A', 'Z', 3, 0))).not.toContain('Daily');
  });
});

describe('connect two', () => {
  /** A map stand-in on the sample set that records what the mode asked of it. */
  function host(): ConnectHost & { at: string | null; marks: (string | null)[]; states: ConnectState[] } {
    const provider = new SampleProvider();
    const h = {
      provider,
      at: null as string | null,
      marks: [] as (string | null)[],
      states: [] as ConnectState[],
      current: () => h.at,
      open: async (title: string) => {
        h.at = await provider.constellation(title).then(
          (c) => c.center.title,
          () => null,
        );
        return h.at;
      },
      travel: async (title: string) => {
        const ok = (await provider.neighbours(h.at ?? '')).includes(title);
        if (ok) h.at = title;
        return ok;
      },
      mark: (title: string | null) => void h.marks.push(title),
      render: (state: ConnectState | null) => void (state && h.states.push(state)),
      wait: () => Promise.resolve(),
    };
    return h;
  }

  it('finds a chain where every link can be clicked', async () => {
    const provider = new SampleProvider();
    const chain = (await chainBetween(provider, 'Brutalist architecture', 'Jazz')) ?? [];
    expect(chain[0]).toBe('Brutalist architecture');
    expect(chain[chain.length - 1]).toBe('Jazz');
    expect(chain).toHaveLength(5);
    expect(await clickable(provider, chain)).toBe(true);
  });

  it('walks the whole chain, ringing the next star each time', async () => {
    const h = host();
    const connect = new Connect(h);
    connect.start();
    expect(h.states[0]).toMatchObject({ step: 'form', from: '' });
    await connect.run(' Brutalist architecture ', 'Jazz');
    const last = h.states[h.states.length - 1];
    expect(last).toMatchObject({ step: 'chain', at: 4, walking: false });
    expect(h.at).toBe('Jazz');
    expect(h.marks.slice(-5)).toEqual(['Architecture', 'History', 'Music', 'Jazz', null]);
    expect(h.states.some((s) => s.step === 'searching')).toBe(true);

    await connect.replay();
    expect(h.at).toBe('Jazz');
    connect.start();
    expect(h.states[h.states.length - 1]).toMatchObject({ step: 'form', from: 'Brutalist architecture' });
  });

  it('goes back to the form with a reason when it cannot connect', async () => {
    const h = host();
    const connect = new Connect(h);
    await connect.run('Zzqx', 'Jazz');
    expect(h.states[h.states.length - 1]).toMatchObject({ step: 'form', note: 'No article called “Zzqx” was found.' });
    await connect.run('Jazz', 'Jazz');
    expect(h.states[h.states.length - 1]).toMatchObject({ step: 'form', note: expect.stringContaining('same article') });
    await connect.run('Jazz', 'Zzqx');
    expect(h.states[h.states.length - 1]).toMatchObject({ step: 'form', note: expect.stringContaining('No chain') });
  });

  it('stops walking when the reader travels somewhere else, and when the mode is left', async () => {
    const h = host();
    const connect = new Connect(h);
    let waits = 0;
    h.wait = () => {
      if (++waits === 2) h.at = 'Bauhaus';
      return Promise.resolve();
    };
    await connect.run('Brutalist architecture', 'Jazz');
    expect(h.states[h.states.length - 1]).toMatchObject({ step: 'chain', at: 1, walking: false });
    expect(h.at).toBe('Bauhaus');

    const quiet = host();
    const left = new Connect(quiet);
    quiet.wait = () => {
      left.stop();
      return Promise.resolve();
    };
    await left.run('Brutalist architecture', 'Jazz');
    expect(left.state).toBeNull();
    expect(quiet.at).toBe('Brutalist architecture');
  });

  it('draws the form, the wait and the chain, escaping what was typed', () => {
    const form = connectHtml({ step: 'form', from: 'Rock "n" roll', to: '', note: '<b>' });
    expect(form).toContain('value="Rock &quot;n&quot; roll"');
    expect(form).toContain('&lt;b&gt;');
    expect(connectHtml({ step: 'searching', from: 'A', to: 'Z' })).toContain('Looking for a chain');
    const chain = connectHtml({ step: 'chain', chain: ['A', 'B', 'Z'], at: 1, walking: true });
    expect(chain).toContain('<li class=\'past\'><button class="lk" type="button" data-t="A">');
    expect(chain).toContain("<li class='at'>");
    expect(chain).toContain('2 links');
    expect(chain).toContain("id='cstop'");
    expect(connectHtml({ step: 'chain', chain: ['A', 'Z'], at: 1, walking: false })).toContain('1 link<');
  });
});

describe('picking the next chain for the reader', () => {
  it('connects a picked pair in one step', async () => {
    const provider = new SampleProvider();
    const states: ConnectState[] = [];
    const h: ConnectHost = {
      provider,
      current: () => null,
      open: async (t) => t,
      travel: async () => true,
      mark: () => undefined,
      render: (s) => void (s && states.push(s)),
      wait: () => Promise.resolve(),
    };
    const connect = new Connect(h);
    await connect.surprise(async () => ({ start: 'Brutalist architecture', target: 'Jazz' }));
    expect(states[0]).toEqual({ step: 'picking' });
    expect(states[states.length - 1]).toMatchObject({ step: 'chain', walking: false });
  });

  it('falls back to the form when no pair can be picked', async () => {
    const states: ConnectState[] = [];
    const h = {
      provider: new SampleProvider(),
      current: () => null,
      open: async (t: string) => t,
      travel: async () => true,
      mark: () => undefined,
      render: (s: ConnectState | null) => void (s && states.push(s)),
      wait: () => Promise.resolve(),
    };
    await new Connect(h).surprise(() => Promise.reject(new Error('no pair')));
    expect(states[states.length - 1]).toMatchObject({ step: 'form' });
  });

  it('lists strong ties first and leaves visited places for last', () => {
    const n = (title: string, rank: number, score: number) => ({ title, rank, score });
    const nodes = [n('a', 4, 9), n('b', 1, 1), n('c', 1, 5), n('d', 2, 3)];
    expect(closest(nodes, new Set(), 4).map((x) => x.title)).toEqual(['c', 'b', 'd', 'a']);
    expect(closest(nodes, new Set(['c']), 4).map((x) => x.title)).toEqual(['b', 'd', 'a', 'c']);
  });
});

describe('the verdict on a finished race', () => {
  it('compares clicks with par in words', () => {
    expect(verdict(4, 4)).toBe('Par!');
    expect(verdict(5, 3)).toBe('2 over par');
    expect(verdict(2, 3)).toBe('1 under par, a shortcut');
    expect(verdict(4, null)).toBe('');
    expect(verdict(4, -1)).toBe('');
  });
});

describe('what the search box offers when empty', () => {
  it('lists the best unvisited stars with their ties', () => {
    const nodes = [
      { title: 'a', rank: 4, score: 1 },
      { title: 'b', rank: 1, score: 2 },
    ];
    expect(suggestNext(nodes, new Set(['b']), 2)).toEqual([
      { title: 'a', description: 'Loose tie' },
      { title: 'b', description: 'Close tie' },
    ]);
  });
});

describe('the race card hint', () => {
  it('shows a line about the target while the race runs', () => {
    const race = beginRace('A', 'B', 3, 0);
    expect(hudHtml(race)).not.toContain("class='hint'");
    race.hint = 'A river in <Spain>.';
    expect(hudHtml(race)).toContain("<div class='hint'>A river in &lt;Spain&gt;.</div>");
  });
});

describe('solvePar', () => {
  it('proves par and returns the route on the sample set', async () => {
    const r = await solvePar(new SampleProvider(), 'Brutalist architecture', 'Jazz');
    expect(r).toMatchObject({ par: 4, exact: true });
    expect(r.route).toHaveLength(5);
    expect(r.route?.[0]).toBe('Brutalist architecture');
    expect(r.route?.[4]).toBe('Jazz');
  });

  it('agrees with a full breadth-first search across the sample set', async () => {
    const titles = SampleProvider.titles;
    for (let i = 0; i < titles.length; i += 9) {
      const from = titles[i] ?? '';
      const to = titles[(i * 5 + 3) % titles.length] ?? '';
      const truth = await trueDistance(new SampleProvider(), from, to);
      const r = await solvePar(new SampleProvider(), from, to);
      if (truth >= 0 && truth <= 6) expect(r.par, from + ' to ' + to).toBe(truth);
    }
  });

  it('drops a link the map does not offer and finds the next best chain', async () => {
    // B lists A but A does not list B, so A to B is a link the solver sees from B's side only.
    const p = fake({ A: ['C'], B: ['A', 'Z'], C: ['D'], D: ['Z'], Z: ['D'] });
    const r = await solvePar(p, 'A', 'Z');
    expect(r.route).toEqual(['A', 'C', 'D', 'Z']);
    expect(r.par).toBe(3);
  });

  it('shows a route on the win card', () => {
    const race = beginRace('A', 'Z', 2, 0);
    race.route = ['A', 'B', 'Z'];
    race.done = true;
    expect(hudHtml(race)).toContain('Shortest route: A → B → Z');
    race.parExact = false;
    expect(hudHtml(race)).toContain('par ≤ 2');
  });
});
