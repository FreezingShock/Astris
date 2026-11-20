/**
 * The par solver: a shortest chain of clicks between two articles, with proof of when it is the shortest.
 *
 * It is a breadth-first search from both ends. Each side is grown one whole level at a time, always the side
 * with the smaller frontier. A node counts as met only when both searches have it, and because every earlier
 * level is complete, the first chain found is a shortest chain, not just a short one. If the budget runs out
 * first there is no chain to show, only the proof that none is shorter than `lower` clicks.
 *
 * The solver knows nothing about Wikipedia. It reads links through a `LinkSource`.
 */

/** One expansion: the articles one click from a title, and whether the list is the whole list. */
export interface Links {
  titles: string[];
  /** False when the source stopped early (a page cap on a huge article), so a shorter chain may be hiding. */
  complete: boolean;
}

/** Where the solver reads links. A link counts in both directions: the map lets a reader click a star that links in. */
export interface LinkSource {
  links(title: string): Promise<Links>;
}

export interface SolveOptions {
  /** The longest chain worth finding, in clicks. */
  maxDepth: number;
  /** The most expansions (articles asked of the source) the search may make. */
  budget: number;
  /** An edge the solver must not use, from one title to the next. Used to drop links a reader cannot click. */
  banned?: (from: string, to: string) => boolean;
  /** How many expansions run at once. */
  batch?: number;
}

export interface Solution {
  /** A shortest chain from start to target, both ends included, or null when none was found. */
  path: string[] | null;
  /** Clicks along `path`, or -1 when there is none. */
  length: number;
  /** True when `path` is proven shortest. A path is never returned unless this holds. */
  exact: boolean;
  /** No chain shorter than this exists. Equals `length` when exact. */
  lower: number;
  /** Why there is no path: `budget`, `depth` (nothing within maxDepth), or `closed` (one end reaches nothing new). */
  stopped?: 'budget' | 'depth' | 'closed';
  /** Articles asked of the source. */
  expansions: number;
  /** True when some list was cut short. Then `exact` means exact over the links that were read. */
  truncated: boolean;
}

interface Side {
  dist: Map<string, number>;
  /** The next article towards this side's own end. */
  via: Map<string, string>;
  frontier: string[];
  depth: number;
}

const side = (end: string): Side => ({ dist: new Map([[end, 0]]), via: new Map(), frontier: [end], depth: 0 });

function walk(s: Side, from: string): string[] {
  const out = [from];
  for (let t = s.via.get(from); t !== undefined; t = s.via.get(t)) out.push(t);
  return out;
}

export async function solve(source: LinkSource, from: string, to: string, opt: SolveOptions): Promise<Solution> {
  if (from === to) return { path: [from], length: 0, exact: true, lower: 0, expansions: 0, truncated: false };
  const batch = Math.max(1, opt.batch ?? 4);
  const fwd = side(from);
  const bwd = side(to);
  let expansions = 0;
  let truncated = false;
  const done = (extra: Partial<Solution>): Solution => ({ path: null, length: -1, exact: false, lower: fwd.depth + bwd.depth + 1, expansions, truncated, ...extra });

  while (fwd.depth + bwd.depth < opt.maxDepth) {
    if (!fwd.frontier.length || !bwd.frontier.length) return done({ lower: Infinity, stopped: 'closed' });
    const forward = fwd.frontier.length <= bwd.frontier.length;
    const [a, b] = forward ? [fwd, bwd] : [bwd, fwd];
    const next: string[] = [];
    for (let i = 0; i < a.frontier.length; i += batch) {
      const room = opt.budget - expansions;
      const chunk = a.frontier.slice(i, i + Math.min(batch, Math.max(0, room)));
      if (!chunk.length) return done({ stopped: 'budget' });
      expansions += chunk.length;
      const lists = await Promise.all(chunk.map((t) => source.links(t)));
      let meet: string | null = null;
      chunk.forEach((t, k) => {
        const got = lists[k];
        if (!got) return;
        if (!got.complete) truncated = true;
        for (const n of got.titles) {
          if (a.dist.has(n) || (opt.banned && (forward ? opt.banned(t, n) : opt.banned(n, t)))) continue;
          a.dist.set(n, a.depth + 1);
          a.via.set(n, t);
          next.push(n);
          if (meet === null && b.dist.has(n)) meet = n;
        }
      });
      // Every level before this one is complete on both sides, so a meeting here is as short as any chain can be.
      if (meet !== null) {
        const path = walk(fwd, meet).reverse().concat(walk(bwd, meet).slice(1));
        return { path, length: path.length - 1, exact: !truncated, lower: path.length - 1, expansions, truncated };
      }
    }
    a.frontier = next;
    a.depth++;
  }
  return done({ stopped: 'depth' });
}
