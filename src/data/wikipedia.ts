/**
 * WikipediaProvider: live data from English Wikipedia, straight from the browser.
 * Endpoints were checked against the live API on 2026-11-20:
 *   suggestions   generator=prefixsearch with prop=pageimages|description
 *   links out     generator=links (redirects resolved), article namespace
 *   links in      generator=linkshere, article namespace, redirects left out
 *   name matches  generator=prefixsearch and generator=search with intitle:"..."
 *   closeness     generator=search with morelike:, used only to order stars inside a rank
 *   summary       REST /page/summary/{title}
 *   random        list=random, article namespace
 * The link lists come back sorted by title or page id, never in article order, so "more like this" sets the score.
 * Page views would break ties best, but prop=pageviews answers for only about five pages per request, far too many
 * requests for 120 stars. Article length (prop=info) arrives with the lists for free and stands in for prominence.
 */
import type { ArticleSummary, Constellation, DataProvider, Star, SubjectId, Suggestion } from '../types';
import { Http, HttpError, type HttpOptions } from './http';
import { MAX_STARS, rankOf } from './rank';
import { subjectOf } from './subjects';

const ACTION = 'https://en.wikipedia.org/w/api.php';
const REST = 'https://en.wikipedia.org/api/rest_v1/page/summary/';
/** Fetch at most this many pages of each link list. A page holds up to 500 links. */
const MAX_PAGES = 2;
const SUGGESTIONS = 7;
/** Links that sit in citation templates on almost every article and say nothing about the subject. */
const NOISE = new Set(['ISBN', 'ISSN', 'Digital object identifier', 'JSTOR', 'PubMed', 'PubMed Central', 'OCLC', 'Bibcode', 'ArXiv', 'Wayback Machine', 'Main Page']);

/** Thrown by constellation() and summary() when Wikipedia has no article with that title. */
export class ArticleNotFoundError extends Error {
  constructor(readonly title: string) {
    super('No article called "' + title + '" on Wikipedia.');
    this.name = 'ArticleNotFoundError';
  }
}

interface Page {
  title: string;
  ns?: number;
  index?: number;
  missing?: boolean;
  invalid?: boolean;
  description?: string;
  /** Article size in bytes, from prop=info. */
  length?: number;
  thumbnail?: { source?: string };
  categories?: { title: string }[];
}
interface Reply {
  continue?: Record<string, string>;
  query?: { pages?: Page[]; random?: { title: string }[] };
}
interface Candidate {
  description?: string | undefined;
  length: number;
  out: boolean;
  in: boolean;
  name: boolean;
  /** Position in the name search, 1 is best. */
  nameIndex: number;
}

function actionUrl(params: Record<string, string>): string {
  const all = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', origin: '*', ...params });
  return ACTION + '?' + all.toString();
}

function byIndex(a: Page, b: Page): number {
  return (a.index ?? 0) - (b.index ?? 0);
}

/** Lower case with the bracketed part and punctuation removed, for comparing titles. */
function plain(title: string): string {
  return title
    .replace(/\s*\(.*\)$/, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** True when one title contains the other as whole words: "Brutalism" and "Brutalism in Britain". */
export function namesMatch(a: string, b: string): boolean {
  const x = plain(a);
  const y = plain(b);
  if (x.length < 3 || y.length < 3) return false;
  return (' ' + x + ' ').includes(' ' + y + ' ') || (' ' + y + ' ').includes(' ' + x + ' ');
}

/** 0 to 4 for an article's size in bytes, on a log scale: a stub scores near 0, a 100 kB article about 3.2. */
export function lengthBonus(bytes: number): number {
  return Math.min(4, (Math.log10(1 + Math.max(0, bytes) / 1000) / 2.5) * 4);
}

export class WikipediaProvider implements DataProvider {
  private readonly http: Http;
  /** Subjects already shown, so an article keeps its colour as a star and as a centre. */
  private readonly subjects = new Map<string, SubjectId>();
  private readonly built = new Map<string, Promise<Constellation>>();

  constructor(options: HttpOptions = {}) {
    this.http = new Http(options);
  }

  /** Hear about server-requested pauses, to show a quiet "slowing down" note. */
  set onThrottle(listener: ((waitMs: number) => void) | undefined) {
    this.http.onThrottle = listener;
  }

  async suggest(query: string, signal?: AbortSignal): Promise<Suggestion[]> {
    const q = query.trim();
    if (!q) return [];
    const reply = await this.query(
      {
        generator: 'prefixsearch',
        gpssearch: q,
        gpsnamespace: '0',
        gpslimit: String(SUGGESTIONS),
        prop: 'pageimages|description',
        piprop: 'thumbnail',
        pithumbsize: '80',
        redirects: '1',
      },
      signal,
    );
    return (reply.query?.pages ?? []).sort(byIndex).map((p) => {
      const s: Suggestion = { title: p.title };
      if (p.description) s.description = p.description;
      if (p.thumbnail?.source) s.thumbnail = p.thumbnail.source;
      return s;
    });
  }

  constellation(title: string, signal?: AbortSignal): Promise<Constellation> {
    const key = title.trim();
    const known = this.built.get(key);
    if (known) {
      // If the caller who started this build cancelled it, build again for this caller.
      return known.catch((err: unknown) => {
        if (signal?.aborted || !(err instanceof Error) || err.name !== 'AbortError') throw err;
        return this.constellation(title, signal);
      });
    }
    const made = this.build(key, signal);
    this.built.set(key, made);
    // A failed or cancelled build must not be remembered.
    made.then(
      (con) => this.built.set(con.center.title, made),
      () => this.built.delete(key),
    );
    return made;
  }

  async summary(title: string, signal?: AbortSignal): Promise<ArticleSummary> {
    const path = encodeURIComponent(title.trim().replace(/ /g, '_'));
    let raw: unknown;
    try {
      raw = await this.http.getJson(REST + path + '?redirect=true', signal);
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) throw new ArticleNotFoundError(title);
      throw err;
    }
    const r = raw as { title?: string; extract?: string; thumbnail?: { source?: string }; content_urls?: { desktop?: { page?: string } } };
    const out: ArticleSummary = {
      title: r.title ?? title,
      extract: r.extract ?? '',
      url: r.content_urls?.desktop?.page ?? 'https://en.wikipedia.org/wiki/' + path,
    };
    if (r.thumbnail?.source) out.thumbnail = r.thumbnail.source;
    return out;
  }

  async random(signal?: AbortSignal): Promise<string> {
    const raw = await this.http.getJson(actionUrl({ list: 'random', rnnamespace: '0', rnlimit: '1' }), signal, true);
    const title = (raw as Reply).query?.random?.[0]?.title;
    if (!title) throw new Error('Wikipedia returned no random article.');
    return title;
  }

  /** Every article one click away: the stars of the constellation. Empty for a missing article. */
  async neighbours(title: string, signal?: AbortSignal): Promise<string[]> {
    try {
      return (await this.constellation(title, signal)).stars.map((s) => s.title);
    } catch (err) {
      if (err instanceof ArticleNotFoundError) return [];
      throw err;
    }
  }

  private async query(params: Record<string, string>, signal?: AbortSignal): Promise<Reply> {
    return (await this.http.getJson(actionUrl(params), signal)) as Reply;
  }

  /** A generator query, followed for at most `pages` pages. */
  private async list(params: Record<string, string>, pages: number, signal?: AbortSignal): Promise<Page[]> {
    const out: Page[] = [];
    let more: Record<string, string> = {};
    for (let i = 0; i < pages; i++) {
      const reply = await this.query({ ...params, ...more }, signal);
      for (const p of reply.query?.pages ?? []) if (!p.missing && !p.invalid && (p.ns ?? 0) === 0) out.push(p);
      if (!reply.continue) break;
      more = reply.continue;
    }
    return out;
  }

  private async build(asked: string, signal?: AbortSignal): Promise<Constellation> {
    if (!asked) throw new ArticleNotFoundError(asked);
    const head = await this.query({ titles: asked, redirects: '1', prop: 'categories|description', clshow: '!hidden', cllimit: 'max' }, signal);
    const page = head.query?.pages?.[0];
    if (!page || page.missing || page.invalid) throw new ArticleNotFoundError(asked);
    const title = page.title;
    const subject = this.subjects.get(title) ?? subjectOf({ title, description: page.description, categories: page.categories?.map((c) => c.title) });
    this.subjects.set(title, subject);

    const d = { prop: 'description|info', redirects: '1' };
    const phrase = title.replace(/\s*\(.*\)$/, '').replace(/"/g, '');
    const [out, into, prefix, inTitle, alike] = await Promise.all([
      this.list({ ...d, generator: 'links', titles: title, gplnamespace: '0', gpllimit: 'max' }, MAX_PAGES, signal),
      this.list({ ...d, generator: 'linkshere', titles: title, glhnamespace: '0', glhshow: '!redirect', glhlimit: 'max' }, MAX_PAGES, signal),
      this.list({ ...d, generator: 'prefixsearch', gpssearch: phrase, gpsnamespace: '0', gpslimit: '20' }, 1, signal),
      this.list({ ...d, generator: 'search', gsrsearch: 'intitle:"' + phrase + '"', gsrnamespace: '0', gsrlimit: '20' }, 1, signal),
      this.list({ ...d, generator: 'search', gsrsearch: 'morelike:' + title, gsrnamespace: '0', gsrlimit: '50' }, 1, signal),
    ]);

    const found = new Map<string, Candidate>();
    const add = (p: Page): Candidate | undefined => {
      if (p.title === title || NOISE.has(p.title)) return undefined;
      let c = found.get(p.title);
      if (!c) {
        c = { description: p.description, length: p.length ?? 0, out: false, in: false, name: false, nameIndex: 0 };
        found.set(p.title, c);
      }
      return c;
    };
    for (const p of out) {
      const c = add(p);
      if (c) c.out = true;
    }
    for (const p of into) {
      const c = add(p);
      if (c) c.in = true;
    }
    for (const p of prefix.sort(byIndex).concat(inTitle.sort(byIndex))) {
      const c = add(p);
      if (c && !c.name) {
        c.name = true;
        c.nameIndex = p.index ?? 20;
      }
    }
    const closeness = new Map(alike.map((p) => [p.title, 51 - Math.min(50, p.index ?? 50)]));

    const stars: Star[] = [];
    for (const [t, c] of found) {
      const nameMatch = c.name || namesMatch(t, title);
      const starSubject = this.subjects.get(t) ?? subjectOf({ title: t, description: c.description });
      // Higher is closer: Wikipedia's own "more like this" order first, then a shared subject, then the name search order,
      // and last the article's length, which settles ties in favour of the more developed article.
      const score = (closeness.get(t) ?? 0) * 2 + (starSubject === subject ? 5 : 0) + (c.nameIndex ? 4 - c.nameIndex / 5 : 0) + lengthBonus(c.length);
      stars.push({ title: t, subject: starSubject, linksOut: c.out, linksIn: c.in, nameMatch, rank: rankOf(c.out, c.in, nameMatch), score });
    }
    stars.sort((a, b) => a.rank - b.rank || b.score - a.score || a.title.localeCompare(b.title));
    stars.length = Math.min(stars.length, MAX_STARS);
    for (const s of stars) this.subjects.set(s.title, s.subject);
    return { center: { title, subject }, stars };
  }
}
