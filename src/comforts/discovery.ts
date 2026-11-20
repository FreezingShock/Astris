import type { Constellation } from '../types';
import { hash } from '../lib';
import { isSubject } from '../styles';

/** The part of localStorage the counter needs, so tests can hand in their own. */
export interface DiscoveryStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const KEY = 'astris.discovered.v1';
/** Past this many articles the counter keeps counting but stops growing the saved list. */
const SAVE_CAP = 50_000;

function browserStore(): DiscoveryStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // storage blocked, for example in a private window
  }
}

/**
 * Counts every distinct article and subject the reader has ever seen on the map.
 * The count survives new maps, new races and reloads. Articles are remembered as
 * 32-bit hashes of their titles, which keeps the saved list small.
 */
export class Discovery {
  private readonly articles = new Set<number>();
  private readonly subjects = new Set<string>();

  constructor(private readonly store: DiscoveryStore | null = browserStore()) {
    this.load();
  }

  /** Distinct articles seen. */
  get count(): number {
    return this.articles.size;
  }

  /** Distinct subject colour families seen. */
  get subjectCount(): number {
    return this.subjects.size;
  }

  /** The status line wording, for example "1,204 articles · 9 subjects discovered". */
  get label(): string {
    const a = this.count;
    const s = this.subjectCount;
    return a.toLocaleString('en-US') + (a === 1 ? ' article' : ' articles') + ' · ' + s + (s === 1 ? ' subject' : ' subjects') + ' discovered';
  }

  /** Forget everything, here and in storage. */
  reset(): void {
    this.articles.clear();
    this.subjects.clear();
    this.save();
  }

  /** Record a constellation. Returns how many of its articles were new. */
  note(data: Constellation): number {
    const before = this.count;
    const subjectsBefore = this.subjectCount;
    this.see(data.center.title, data.center.subject);
    for (const s of data.stars) this.see(s.title, s.subject);
    const fresh = this.count - before;
    if (fresh || this.subjectCount !== subjectsBefore) this.save();
    return fresh;
  }

  private see(title: string, subject: string): void {
    this.articles.add(hash(title));
    if (isSubject(subject)) this.subjects.add(subject);
  }

  private load(): void {
    try {
      const raw = this.store?.getItem(KEY);
      if (!raw) return;
      const saved: unknown = JSON.parse(raw);
      if (typeof saved !== 'object' || saved === null) return;
      const { a, s } = saved as { a?: unknown; s?: unknown };
      if (Array.isArray(a)) for (const n of a) if (typeof n === 'number' && Number.isInteger(n)) this.articles.add(n >>> 0);
      if (Array.isArray(s)) for (const t of s) if (typeof t === 'string' && isSubject(t)) this.subjects.add(t);
    } catch {
      // a damaged entry starts the count again
    }
  }

  private save(): void {
    if (!this.store || this.articles.size > SAVE_CAP) return;
    try {
      this.store.setItem(KEY, JSON.stringify({ a: [...this.articles], s: [...this.subjects] }));
    } catch {
      // storage full or blocked: the count still works for this visit
    }
  }
}
