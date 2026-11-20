import type { Page, Route } from '@playwright/test';

/**
 * A tiny stand-in for English Wikipedia's action API and REST summary, replayed with page.route.
 * It answers the same query shapes WikipediaProvider sends, so the real built site runs against it.
 * Shapes were checked against the live API on 2026-11-20; behaviour that depends on live data still needs a live check.
 */
export interface Fake {
  /** Article title to the titles it links to. A key with an empty list is a dead end. */
  links: Record<string, string[]>;
  /** Redirect title to its target. */
  redirects?: Record<string, string>;
  descriptions?: Record<string, string>;
  /** Every API request seen, as a URL. */
  calls: string[];
}

export type Mode = 'ok' | 'http500' | 'http429' | 'apierror' | 'html' | 'offline';

export class FakeWiki {
  mode: Mode = 'ok';
  /** Requests answered with 429 before the mode flips back to ok, when mode is http429. */
  throttled = 0;
  readonly calls: string[] = [];
  randoms: string[] = [];
  private nextRandom = 0;

  constructor(
    readonly links: Record<string, string[]>,
    readonly redirects: Record<string, string> = {},
    readonly descriptions: Record<string, string> = {},
  ) {}

  resolve(title: string): string {
    return this.redirects[title] ?? title;
  }

  has(title: string): boolean {
    return title in this.links;
  }

  private linksHere(title: string): string[] {
    return Object.keys(this.links).filter((t) => this.links[t]?.includes(title));
  }

  private page(title: string, index: number): Record<string, unknown> {
    const p: Record<string, unknown> = { pageid: index + 1, ns: 0, title, index: index + 1, length: 5000 + title.length * 700 };
    const d = this.descriptions[title];
    if (d) p.description = d;
    return p;
  }

  private action(q: URLSearchParams): unknown {
    if (q.get('list') === 'random') {
      const pool = this.randoms.length ? this.randoms : Object.keys(this.links);
      const title = pool[this.nextRandom++ % pool.length] ?? '';
      return { batchcomplete: true, query: { random: [{ id: 1, ns: 0, title }] } };
    }
    const gen = q.get('generator');
    if (!gen) {
      const asked = q.get('titles') ?? '';
      const title = this.resolve(asked);
      if (!this.has(title)) return { batchcomplete: true, query: { pages: [{ title: asked, missing: true }] } };
      const page: Record<string, unknown> = { pageid: 1, ns: 0, title };
      const d = this.descriptions[title];
      if (d) page.description = d;
      return { batchcomplete: true, query: { pages: [page] } };
    }
    let titles: string[] = [];
    if (gen === 'links') titles = (this.links[this.resolve(q.get('titles') ?? '')] ?? []).map((t) => this.resolve(t));
    else if (gen === 'linkshere') titles = this.linksHere(this.resolve(q.get('titles') ?? ''));
    else if (gen === 'prefixsearch') {
      const s = (q.get('gpssearch') ?? '').toLowerCase();
      titles = Object.keys(this.links).filter((t) => t.toLowerCase().startsWith(s));
      const limit = Number(q.get('gpslimit') ?? 10);
      titles = titles.slice(0, limit);
    } else if (gen === 'search') {
      const s = q.get('gsrsearch') ?? '';
      if (s.startsWith('morelike:')) titles = (this.links[this.resolve(s.slice(9))] ?? []).slice(0, 50);
      else {
        const phrase = s
          .replace(/^intitle:"/, '')
          .replace(/"$/, '')
          .toLowerCase();
        titles = Object.keys(this.links).filter((t) => t.toLowerCase().includes(phrase));
      }
    }
    const seen = new Set<string>();
    const pages = titles.filter((t) => this.has(t) && !seen.has(t) && seen.add(t)).map((t, i) => this.page(t, i));
    return { batchcomplete: true, query: { pages } };
  }

  async handle(route: Route): Promise<void> {
    const url = new URL(route.request().url());
    this.calls.push(url.pathname + url.search);
    const cors = { 'access-control-allow-origin': '*' };
    if (this.mode === 'offline') return route.abort('failed');
    if (this.mode === 'http500') return route.fulfill({ status: 500, headers: cors, body: 'boom' });
    if (this.mode === 'http429') {
      if (this.throttled-- > 0) return route.fulfill({ status: 429, headers: { ...cors, 'retry-after': '1' }, body: 'slow down' });
      this.mode = 'ok';
    }
    if (this.mode === 'html') return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'text/html' }, body: '<html>Please wait</html>' });
    if (this.mode === 'apierror') {
      return route.fulfill({
        status: 200,
        headers: { ...cors, 'content-type': 'application/json' },
        body: JSON.stringify({ error: { code: 'internal_api_error_DBQueryError', info: 'try again' } }),
      });
    }
    if (url.pathname.startsWith('/api/rest_v1/page/summary/')) {
      const asked = decodeURIComponent(url.pathname.slice('/api/rest_v1/page/summary/'.length)).replace(/_/g, ' ');
      const title = this.resolve(asked);
      if (!this.has(title)) return route.fulfill({ status: 404, headers: cors, body: '{}' });
      const extract = this.descriptions[title] ? title + ' is ' + this.descriptions[title] + '.' : title + ' is an article.';
      return route.fulfill({
        status: 200,
        headers: { ...cors, 'content-type': 'application/json' },
        body: JSON.stringify({ title, extract, content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/' + title.replace(/ /g, '_') } } }),
      });
    }
    return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(this.action(url.searchParams)) });
  }

  async install(page: Page): Promise<void> {
    await page.route('https://en.wikipedia.org/**', (r) => this.handle(r));
  }
}

/** A small world with a redirect, a disambiguation page, a dead end and a hub. */
export function world(): FakeWiki {
  const hub = ['Alpha', 'Beta', 'Gamma', 'Mercury', 'Dead end', 'United States', 'Delta'];
  return new FakeWiki(
    {
      Hub: hub,
      Alpha: ['Hub', 'Beta', 'Epsilon'],
      Beta: ['Hub', 'Alpha', 'Zeta'],
      Gamma: ['Hub', 'Delta'],
      Delta: ['Gamma', 'Eta'],
      Epsilon: ['Alpha', 'Theta'],
      Zeta: ['Beta', 'Theta'],
      Theta: ['Epsilon', 'Zeta', 'Iota'],
      Eta: ['Delta', 'Iota'],
      Iota: ['Theta', 'Eta'],
      Mercury: ['Mercury (planet)', 'Mercury (element)', 'Freddie Mercury'],
      'Mercury (planet)': ['Hub'],
      'Mercury (element)': ['Hub'],
      'Freddie Mercury': ['Hub'],
      'Dead end': [],
      'United States': ['Hub', 'Alpha'],
    },
    { USA: 'United States', 'U.S.': 'United States' },
    { Mercury: 'Topics referred to by the same term', 'Dead end': 'an article with no links', Hub: 'a hub' },
  );
}
