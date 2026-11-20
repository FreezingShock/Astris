import { describe, expect, it, vi } from 'vitest';
import { ArticleNotFoundError, MAX_STARS, WikipediaProvider, rankOf } from '../../src/data';
import { lengthBonus, namesMatch } from '../../src/data/wikipedia';

type Row = { title: string; description?: string; index?: number; ns?: number; length?: number };
interface World {
  /** Redirects and the centre page: asked title to real title. */
  pages: Record<string, { title: string; description?: string; categories?: string[] }>;
  links?: Row[][]; // one entry per page of results
  linkshere?: Row[][];
  prefixsearch?: Row[];
  intitle?: Row[];
  morelike?: Row[];
}

/** A fetch that answers like the Action API and the REST summary, from a small made-up world. */
function wiki(world: World) {
  const calls: URL[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
    const url = new URL(String(input));
    calls.push(url);
    const q = url.searchParams;
    const reply = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status });
    if (url.pathname.startsWith('/api/rest_v1/page/summary/')) {
      const title = decodeURIComponent(url.pathname.split('/').pop() ?? '').replace(/_/g, ' ');
      const page = world.pages[title];
      if (!page) return reply({ type: 'not_found' }, 404);
      return reply({
        title: page.title,
        extract: page.title + ' is an article.',
        thumbnail: { source: 'https://img/t.png' },
        content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/X' } },
      });
    }
    expect(q.get('origin')).toBe('*');
    expect(q.get('format')).toBe('json');
    expect(q.get('formatversion')).toBe('2');
    if (q.get('list') === 'random') return reply({ query: { random: [{ title: 'Random ' + calls.length }] } });
    const paged = (pages: Row[][], key: string): Response => {
      const at = Number(q.get(key) ?? 0);
      const body: Record<string, unknown> = { query: { pages: pages[at] ?? [] } };
      if (at + 1 < pages.length) body.continue = { [key]: String(at + 1), continue: key + '||' };
      return reply(body);
    };
    switch (q.get('generator')) {
      case 'links':
        return paged(world.links ?? [], 'gplcontinue');
      case 'linkshere':
        return paged(world.linkshere ?? [], 'glhcontinue');
      case 'prefixsearch':
        return reply({ query: { pages: world.prefixsearch ?? [] } });
      case 'search':
        return reply({ query: { pages: (q.get('gsrsearch') ?? '').startsWith('morelike:') ? (world.morelike ?? []) : (world.intitle ?? []) } });
    }
    const page = world.pages[q.get('titles') ?? ''];
    if (!page) return reply({ query: { pages: [{ title: q.get('titles'), missing: true }] } });
    return reply({ query: { pages: [{ title: page.title, description: page.description, categories: (page.categories ?? []).map((c) => ({ title: 'Category:' + c })) }] } });
  });
  return { provider: new WikipediaProvider({ fetch, storage: null }), fetch, calls };
}

const rows = (prefix: string, n: number): Row[] => Array.from({ length: n }, (_, i) => ({ title: prefix + ' ' + i, ns: 0 }));

describe('WikipediaProvider.constellation', () => {
  const world: World = {
    pages: {
      Brutalism: { title: 'Brutalist architecture', description: 'Architectural style' },
      'Brutalist architecture': { title: 'Brutalist architecture', description: 'Architectural style' },
    },
    links: [
      [
        { title: 'Le Corbusier', description: 'Swiss-French architect (1887–1965)' },
        { title: 'Concrete', description: 'Composite construction material' },
        { title: 'List of Brutalist architecture', description: '' },
        { title: 'Ankara', description: 'Capital of Turkey' },
        { title: 'ISBN' },
        { title: 'Brutalist architecture' },
        { title: 'Talk:Something', ns: 1 },
      ],
    ],
    linkshere: [[{ title: 'Le Corbusier' }, { title: 'List of Brutalist architecture' }, { title: 'Boston City Hall', description: 'City hall of Boston, Massachusetts' }]],
    prefixsearch: [{ title: 'Brutalist architecture', index: 1 }],
    intitle: [
      { title: 'Atlas of Brutalist Architecture', index: 2, description: 'Reference book' },
      { title: 'List of Brutalist architecture', index: 1 },
    ],
    morelike: [
      { title: 'Ankara', index: 1 },
      { title: 'Concrete', index: 2 },
    ],
  };

  it('merges the three lists by title, flags and ranks each star, and resolves the redirect', async () => {
    const { provider } = wiki(world);
    const con = await provider.constellation('Brutalism');
    expect(con.center).toEqual({ title: 'Brutalist architecture', subject: 'Architecture' });
    const by = new Map(con.stars.map((s) => [s.title, s]));
    expect(by.size).toBe(con.stars.length);
    expect(by.get('List of Brutalist architecture')).toMatchObject({ linksOut: true, linksIn: true, nameMatch: true, rank: 1 });
    expect(by.get('Le Corbusier')).toMatchObject({ linksOut: true, linksIn: true, nameMatch: false, rank: 2, subject: 'Architecture' });
    expect(by.get('Concrete')).toMatchObject({ linksOut: true, linksIn: false, rank: 4, subject: 'Civil engineering' });
    expect(by.get('Boston City Hall')).toMatchObject({ linksOut: false, linksIn: true, rank: 4 });
    expect(by.get('Atlas of Brutalist Architecture')).toMatchObject({ linksOut: false, linksIn: false, nameMatch: true, rank: 5 });
    expect(by.get('Ankara')?.subject).toBe('Geography');
    for (const gone of ['ISBN', 'Brutalist architecture', 'Talk:Something']) expect(by.has(gone)).toBe(false);
    for (const s of con.stars) expect(s.rank).toBe(rankOf(s.linksOut, s.linksIn, s.nameMatch));
  });

  it('sorts by rank, then by score, with "more like this" order deciding inside a rank', async () => {
    const con = await wiki(world).provider.constellation('Brutalism');
    expect(con.stars.map((s) => s.title)).toEqual(['List of Brutalist architecture', 'Le Corbusier', 'Ankara', 'Concrete', 'Boston City Hall', 'Atlas of Brutalist Architecture']);
    for (let i = 1; i < con.stars.length; i++) {
      const a = con.stars[i - 1]!;
      const b = con.stars[i]!;
      expect(a.rank < b.rank || (a.rank === b.rank && a.score >= b.score)).toBe(true);
    }
  });

  it('reads at most two pages of each list and keeps the best 120', async () => {
    const both = rows('Both', 30);
    const { provider, calls } = wiki({
      pages: { Big: { title: 'Big' } },
      links: [rows('Out A', 150).concat(both), rows('Out B', 150), rows('Out C', 150)],
      linkshere: [both, rows('In B', 10), rows('In C', 10)],
      intitle: [{ title: 'Big Bang', index: 1 }],
    });
    const con = await provider.constellation('Big');
    expect(con.stars).toHaveLength(MAX_STARS);
    expect(con.stars.slice(0, 30).every((s) => s.rank === 2 && s.title.startsWith('Both'))).toBe(true);
    expect(con.stars.slice(30).every((s) => s.rank === 4)).toBe(true);
    expect(con.stars.some((s) => s.title.startsWith('Out C') || s.title.startsWith('In C') || s.title === 'Big Bang')).toBe(false);
    expect(calls.filter((u) => u.searchParams.get('generator') === 'links')).toHaveLength(2);
    expect(calls.filter((u) => u.searchParams.get('generator') === 'linkshere')).toHaveLength(2);
  });

  it('breaks ties inside a rank with article length, not the alphabet', async () => {
    const { provider, calls } = wiki({
      pages: { Hub: { title: 'Hub' } },
      links: [[{ title: 'Aardvark stub', length: 900 }, { title: 'Middling', length: 20_000 }, { title: 'Zebra epic', length: 180_000 }, { title: 'No size' }]],
    });
    const con = await provider.constellation('Hub');
    expect(con.stars.map((s) => s.title)).toEqual(['Zebra epic', 'Middling', 'Aardvark stub', 'No size']);
    expect(calls.find((u) => u.searchParams.get('generator') === 'links')?.searchParams.get('prop')).toBe('description|info');
    expect(lengthBonus(0)).toBe(0);
    expect(lengthBonus(1e9)).toBe(4);
    expect(lengthBonus(100_000)).toBeLessThan(5); // never outweighs a shared subject
  });

  it('rejects a missing article with ArticleNotFoundError, and neighbours answers with nothing', async () => {
    const { provider } = wiki({ pages: {} });
    await expect(provider.constellation('Zzqx')).rejects.toBeInstanceOf(ArticleNotFoundError);
    await expect(provider.constellation('  ')).rejects.toBeInstanceOf(ArticleNotFoundError);
    expect(await provider.neighbours('Zzqx')).toEqual([]);
  });

  it('builds each constellation once, and neighbours are exactly its stars', async () => {
    const { provider, fetch } = wiki(world);
    const con = await provider.constellation('Brutalism');
    const used = fetch.mock.calls.length;
    expect(await provider.constellation('Brutalist architecture')).toBe(con);
    expect(await provider.neighbours('Brutalism')).toEqual(con.stars.map((s) => s.title));
    expect(fetch).toHaveBeenCalledTimes(used);
  });

  it('keeps the colour a star was shown with when it becomes the centre', async () => {
    const { provider } = wiki({ ...world, pages: { ...world.pages, Ankara: { title: 'Ankara', categories: ['Roman history', 'Ancient wars'] } } });
    await provider.constellation('Brutalism');
    expect((await provider.constellation('Ankara')).center.subject).toBe('Geography');
  });

  it('passes the abort signal on, and lets a later caller build again', async () => {
    const { provider } = wiki(world);
    const ctl = new AbortController();
    ctl.abort();
    await expect(provider.constellation('Brutalism', ctl.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect((await provider.constellation('Brutalism')).stars.length).toBeGreaterThan(0);
  });
});

describe('WikipediaProvider, the rest', () => {
  it('suggests in search order with description and thumbnail', async () => {
    const { provider, calls } = wiki({
      pages: {},
      prefixsearch: [
        { title: 'Brut', index: 3 },
        { title: 'Brutalist architecture', index: 1, description: 'Architectural style', thumbnail: { source: 'https://img/b.png' } } as Row,
        { title: 'Brutus', index: 2 },
      ],
    });
    expect(await provider.suggest(' brut ')).toEqual([
      { title: 'Brutalist architecture', description: 'Architectural style', thumbnail: 'https://img/b.png' },
      { title: 'Brutus' },
      { title: 'Brut' },
    ]);
    expect(calls[0]?.searchParams.get('gpssearch')).toBe('brut');
    expect(await provider.suggest('   ')).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it('returns the summary with a link, and a missing one as ArticleNotFoundError', async () => {
    const { provider, calls } = wiki({ pages: { 'Cell (biology)': { title: 'Cell (biology)' } } });
    expect(await provider.summary('Cell (biology)')).toEqual({
      title: 'Cell (biology)',
      extract: 'Cell (biology) is an article.',
      thumbnail: 'https://img/t.png',
      url: 'https://en.wikipedia.org/wiki/X',
    });
    expect(calls[0]?.pathname).toBe('/api/rest_v1/page/summary/Cell_(biology)');
    await expect(provider.summary('Nope')).rejects.toBeInstanceOf(ArticleNotFoundError);
  });

  it('never caches a random article', async () => {
    const { provider } = wiki({ pages: {} });
    expect(await provider.random()).not.toBe(await provider.random());
  });
});

describe('namesMatch', () => {
  it('matches whole words in either direction, ignoring brackets and case', () => {
    expect(namesMatch('Brutalism in Britain', 'Brutalism')).toBe(true);
    expect(namesMatch('Architecture', 'Brutalist architecture')).toBe(true);
    expect(namesMatch('Mercury (planet)', 'Mercury')).toBe(true);
    expect(namesMatch('Art', 'Artist')).toBe(false);
    expect(namesMatch('Io', 'Iolaus of Io')).toBe(false);
  });
});
