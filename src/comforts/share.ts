/** What a share link restores: the article on the map and the mode it was open in. */
export type ShareState = { mode: 'explore'; article: string } | { mode: 'race'; start: string; target: string };

const PLAY_PATH = '/play';

/** The query for a state: "?a=Jazz" for Explore, "?race=Start|Target" for a race. */
export function shareSearch(state: ShareState): string {
  const query = new URLSearchParams();
  if (state.mode === 'race') query.set('race', state.start + '|' + state.target);
  else query.set('a', state.article);
  // Keep titles readable: spaces as %20 rather than "+", and the pair divider as itself.
  return '?' + query.toString().replace(/\+/g, '%20').replace(/%7C/gi, '|');
}

/** Read a share link's query back. Returns null when it names nothing well-formed. */
export function readShare(search: string): ShareState | null {
  const query = new URLSearchParams(search);
  const race = query.get('race');
  if (race) {
    const [start, target, ...rest] = race.split('|').map((s) => s.trim());
    if (start && target && !rest.length) return { mode: 'race', start, target };
  }
  const article = query.get('a')?.trim();
  return article ? { mode: 'explore', article } : null;
}

/** The whole link for a state. */
export function shareUrl(state: ShareState, origin: string): string {
  return origin.replace(/\/+$/, '') + PLAY_PATH + shareSearch(state);
}

/** The note shown once the link is on the clipboard. */
export function shareNote(state: ShareState): string {
  return state.mode === 'race' ? 'Link copied. It starts the race from ' + state.start + ' to ' + state.target + '.' : 'Link copied. It opens ' + state.article + ' on the map.';
}

export interface ShareOptions {
  /** Where the Share button goes. It is added as the first child. */
  host: HTMLElement;
  /** What the map shows right now, or null before the first article. */
  state: () => ShareState | null;
  /** True while the map is the surface on screen. */
  onMap: () => boolean;
  /** Tell the reader something in a line. */
  toast: (message: string) => void;
}

/**
 * Share links: keeps the address bar pointing at the current article and mode,
 * and adds a Share button that copies that link.
 */
export class Share {
  readonly button: HTMLButtonElement;

  constructor(private readonly o: ShareOptions) {
    const b = document.createElement('button');
    b.type = 'button';
    b.id = 'share';
    b.className = 'gbtn';
    b.textContent = 'Share';
    b.title = 'Copy a link to this article and mode';
    b.addEventListener('click', () => void this.copy());
    o.host.prepend(b);
    this.button = b;
  }

  /** Point the address bar at the current state. Call whenever the article or the mode changes. */
  sync(): void {
    const state = this.o.state();
    if (!state || !this.o.onMap()) return;
    if ((location.pathname.replace(/\/+$/, '') || '/') !== PLAY_PATH) return;
    const search = shareSearch(state);
    if (location.search !== search) history.replaceState(history.state, '', PLAY_PATH + search);
  }

  /** Copy the link for the current state and say so. Returns the link, or null when there is nothing to share. */
  async copy(): Promise<string | null> {
    const state = this.o.state();
    if (!state) return null;
    this.sync();
    const url = shareUrl(state, location.origin);
    const copied = await navigator.clipboard.writeText(url).then(
      () => true,
      () => false, // no clipboard access, for example on an insecure origin
    );
    this.o.toast(copied ? shareNote(state) : 'Could not reach the clipboard. Copy the link from the address bar.');
    return url;
  }
}
