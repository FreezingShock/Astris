/** The surfaces of Astris and the path each lives at. */
export type RouteName = 'main-page' | 'play' | 'stats';

const PATHS: Record<RouteName, string> = { 'main-page': '/', play: '/play', stats: '/stats' };

export function isRouteName(name: string): name is RouteName {
  return name in PATHS;
}

export function pathOf(name: RouteName): string {
  return PATHS[name];
}

/** The route a location points at. Old "#play" style links from the mockup still work. */
export function routeOf(loc: Pick<Location, 'pathname' | 'hash'>): RouteName {
  const hash = loc.hash.replace('#', '');
  if (isRouteName(hash)) return hash;
  const path = loc.pathname.replace(/\/+$/, '') || '/';
  for (const name of Object.keys(PATHS) as RouteName[]) if (PATHS[name] === path) return name;
  return 'main-page';
}

/** Read "/play?race=A|B". Returns null when there is no well-formed pair. */
export function racePairOf(search: string): { start: string; target: string } | null {
  const raw = new URLSearchParams(search).get('race');
  if (!raw) return null;
  const [start, target, ...rest] = raw.split('|').map((s) => s.trim());
  if (!start || !target || rest.length) return null;
  return { start, target };
}

/** Read "/play?a=Title", the share link for an article in Explore. Returns null when there is none. */
export function articleOf(search: string): string | null {
  return new URLSearchParams(search).get('a')?.trim() || null;
}

/**
 * Handles the query of a /play link, such as a share link. Return true when the link was understood,
 * so that nothing else acts on it.
 */
export type PlayLinkHandler = (query: URLSearchParams) => boolean;

const playLinkHandlers: PlayLinkHandler[] = [];

/** Register a handler for /play links. Returns a function that removes it again. */
export function onPlayLink(handler: PlayLinkHandler): () => void {
  playLinkHandlers.push(handler);
  return () => {
    const at = playLinkHandlers.indexOf(handler);
    if (at >= 0) playLinkHandlers.splice(at, 1);
  };
}

/** Offer a /play query to the handlers in the order they registered. True when one of them took it. */
export function dispatchPlayLink(search: string): boolean {
  const query = new URLSearchParams(search);
  if (![...query.keys()].length) return false;
  return playLinkHandlers.some((handler) => handler(query));
}

/** The address of the map with a query, for example playUrl({ a: 'Jazz' }) gives "/play?a=Jazz". Empty values are left out. */
export function playUrl(params: Record<string, string | undefined> = {}): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  const text = query.toString();
  return PATHS.play + (text ? '?' + text : '');
}

/** Write the map's current state into the address bar without adding a history entry. Does nothing off the map. */
export function setPlayQuery(params: Record<string, string | undefined>): void {
  if (routeOf(location) !== 'play') return;
  history.replaceState(history.state, '', playUrl(params));
}
