/** The three surfaces of Astris and the path each lives at. */
export type RouteName = 'main-page' | 'design-system' | 'play';

const PATHS: Record<RouteName, string> = { 'main-page': '/', 'design-system': '/design-system', play: '/play' };

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
