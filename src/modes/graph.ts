import type { DataProvider } from '../types';

/**
 * What one click reaches from each article, remembered for the session.
 * Every par search and pair pick reads through here, so an article is asked for once.
 */
export class Graph {
  private readonly known = new Map<string, Promise<string[]>>();
  /** Finished searches, so asking again for the same chain costs nothing and gives the same answer. */
  readonly routes = new Map<string, Promise<string[] | null>>();

  constructor(private readonly provider: DataProvider) {}

  /** True when asking for this article costs no request. */
  has(title: string): boolean {
    return this.known.has(title);
  }

  /** The articles one click away. A failed request counts as no neighbours and is tried again next time. */
  neighbours(title: string): Promise<string[]> {
    let hit = this.known.get(title);
    if (!hit) {
      hit = this.provider.neighbours(title).catch(() => {
        this.known.delete(title);
        return [];
      });
      this.known.set(title, hit);
    }
    return hit;
  }
}

const graphs = new WeakMap<DataProvider, Graph>();

/** The one shared graph for a provider. */
export function graphOf(provider: DataProvider): Graph {
  let g = graphs.get(provider);
  if (!g) {
    g = new Graph(provider);
    graphs.set(provider, g);
  }
  return g;
}

export interface RouteOptions {
  /** The longest chain worth finding, in clicks. */
  maxDepth: number;
  /** The most articles the search may ask the provider for. Remembered articles are free. */
  budget: number;
  /**
   * The most new articles to ask for at each step out from either end, strongest ties first.
   * Leave it out to ask for all of them, which finds the shortest chain but costs far more requests.
   */
  beam?: number;
}

interface Side {
  dist: Map<string, number>;
  /** The next article towards this side's own end. */
  via: Map<string, string>;
  frontier: string[];
  depth: number;
}

function side(end: string): Side {
  return { dist: new Map([[end, 0]]), via: new Map(), frontier: [end], depth: 0 };
}

function walk(s: Side, from: string): string[] {
  const out = [from];
  for (let t = s.via.get(from); t !== undefined; t = s.via.get(t)) out.push(t);
  return out;
}

const edge = (a: string, b: string): string => a + '\n' + b;

/**
 * Search from both ends at once and return the shortest chain the two searches agree on.
 * The search from the target guesses that a link runs both ways, so the chain is a candidate until checked.
 */
async function meet(graph: Graph, from: string, to: string, opt: RouteOptions, spent: { n: number }, broken: ReadonlySet<string>): Promise<string[] | null> {
  const fwd = side(from);
  const bwd = side(to);
  while (fwd.depth + bwd.depth < opt.maxDepth && fwd.frontier.length && bwd.frontier.length) {
    const forward = fwd.frontier.length <= bwd.frontier.length;
    const [a, b] = forward ? [fwd, bwd] : [bwd, fwd];
    let asked = 0;
    const level = a.frontier.filter((t) => graph.has(t) || (asked < (opt.beam ?? Infinity) && spent.n < opt.budget && ++asked && ++spent.n));
    const lists = await Promise.all(level.map((t) => graph.neighbours(t)));
    const next: string[] = [];
    let best: { at: string; total: number } | null = null;
    level.forEach((t, i) => {
      for (const n of lists[i] ?? []) {
        if (a.dist.has(n) || broken.has(forward ? edge(t, n) : edge(n, t))) continue;
        a.dist.set(n, a.depth + 1);
        a.via.set(n, t);
        next.push(n);
        const other = b.dist.get(n);
        if (other !== undefined && (!best || a.depth + 1 + other < best.total)) best = { at: n, total: a.depth + 1 + other };
      }
    });
    a.frontier = next;
    a.depth++;
    const found = best as { at: string; total: number } | null;
    if (found) return walk(fwd, found.at).reverse().concat(walk(bwd, found.at).slice(1));
  }
  return null;
}

/**
 * A chain of articles from one to another where every step is a real click, or null when none was found
 * within the depth and the request budget. With no beam and budget to spare it is the shortest chain.
 */
export function route(graph: Graph, from: string, to: string, opt: RouteOptions): Promise<string[] | null> {
  const key = [from, to, opt.maxDepth, opt.budget, opt.beam].join('\n');
  let hit = graph.routes.get(key);
  if (!hit) {
    hit = search(graph, from, to, opt);
    graph.routes.set(key, hit);
  }
  return hit;
}

async function search(graph: Graph, from: string, to: string, opt: RouteOptions): Promise<string[] | null> {
  if (from === to) return [from];
  const spent = { n: 0 };
  const broken = new Set<string>();
  for (let attempt = 0; attempt < 6; attempt++) {
    const chain = await meet(graph, from, to, opt, spent, broken);
    if (!chain) return null;
    let ok = true;
    for (let i = 0; i + 1 < chain.length && ok; i++) {
      const a = chain[i] ?? '';
      const b = chain[i + 1] ?? '';
      if (!(await graph.neighbours(a)).includes(b)) {
        broken.add(edge(a, b));
        ok = false;
      }
    }
    if (ok) return chain;
  }
  return null;
}
