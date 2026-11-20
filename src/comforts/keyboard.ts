import type { Con, Point, StarNode } from '../engine';

export type Direction = 'left' | 'right' | 'up' | 'down';

const ARROWS: Record<string, Direction> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
const UNIT: Record<Direction, Point> = { left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, up: { x: 0, y: -1 }, down: { x: 0, y: 1 } };
/** A star must be at least this many pixels along the arrow's direction to count as "that way". */
const MIN_STEP = 6;
/** How much sideways drift costs compared with distance straight ahead. */
const SIDE_COST = 2;
const ZOOM_STEP = 1.4;

/** What keyboard travel needs from the map. The engine fits. */
export interface StarReach {
  readonly current: Con | null;
  readonly trail: readonly string[];
  /** Ring a star as if the pointer were over it; null clears. */
  highlight?(title: string | null): boolean;
  zoomBy(factor: number): void;
  fit(): void;
}

export interface KeyTravel {
  map: StarReach;
  /** Travel to an article, as a click on its star would. */
  go(title: string): void;
}

/**
 * The star an arrow key moves to: the nearest one in that direction, inside a cone
 * around it, where drifting sideways costs more than going straight.
 */
export function nextStar(nodes: readonly StarNode[], from: Point, dir: Direction, skip?: StarNode | null): StarNode | null {
  const u = UNIT[dir];
  let best: StarNode | null = null;
  let bestCost = Infinity;
  for (const n of nodes) {
    if (n === skip || !n.on || n.a < 0.5) continue;
    const dx = n.sx - from.x;
    const dy = n.sy - from.y;
    const along = dx * u.x + dy * u.y;
    const side = Math.abs(dx * u.y - dy * u.x);
    if (along < MIN_STEP || side > along * SIDE_COST) continue;
    const cost = along + side * SIDE_COST;
    if (cost < bestCost) {
      bestCost = cost;
      best = n;
    }
  }
  return best;
}

/** What a screen reader hears when a star is chosen. */
export function announce(n: Pick<StarNode, 'title' | 'subject' | 'rank'>): string {
  return n.title + ', ' + n.subject + ', rank ' + n.rank + '. Press Enter to travel there.';
}

/** The arrow-key cursor over the live constellation. Holds no DOM, so it can be tested alone. */
export class StarCursor {
  private con: Con | null = null;
  private star: StarNode | null = null;

  constructor(
    private readonly travel: KeyTravel,
    private readonly say: (text: string) => void = () => undefined,
  ) {}

  /** The chosen star, or null when there is none or the map has moved on. */
  get selected(): StarNode | null {
    return this.con === this.travel.map.current ? this.star : null;
  }

  /** Handle one key. Returns true when the key was used. */
  key(key: string): boolean {
    const { map } = this.travel;
    const cur = map.current;
    if (!cur) return false;
    const dir = ARROWS[key];
    if (dir) {
      const from = this.selected;
      const next = nextStar(cur.nodes, from ? { x: from.sx, y: from.sy } : { x: cur.cx, y: cur.cy }, dir, from);
      if (next) this.choose(cur, next);
      return true;
    }
    switch (key) {
      case 'Enter':
      case ' ': {
        const star = this.selected;
        if (!star) return false;
        this.clear();
        this.travel.go(star.title);
        return true;
      }
      case 'Escape':
        if (!this.selected) return false;
        this.clear();
        return true;
      case 'Backspace': {
        const back = map.trail[map.trail.length - 2];
        if (back === undefined) return false;
        this.clear();
        this.travel.go(back);
        return true;
      }
      case '+':
      case '=':
        map.zoomBy(ZOOM_STEP);
        return true;
      case '-':
      case '_':
        map.zoomBy(1 / ZOOM_STEP);
        return true;
      case '0':
        map.fit();
        return true;
      default:
        return false;
    }
  }

  clear(): void {
    if (this.selected) this.travel.map.highlight?.(null);
    this.con = null;
    this.star = null;
  }

  private choose(con: Con, star: StarNode): void {
    this.con = con;
    this.star = star;
    this.travel.map.highlight?.(star.title);
    this.say(announce(star));
  }
}

function typing(t: EventTarget | null): boolean {
  return t instanceof HTMLElement && (t.isContentEditable || t.matches('input, textarea, select'));
}

function pressable(t: EventTarget | null): boolean {
  return t instanceof HTMLElement && t.matches('button, a, summary, [role="link"], [role="button"]');
}

function liveRegion(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'sr-only';
  el.setAttribute('aria-live', 'polite');
  (document.getElementById('play') ?? document.body).appendChild(el);
  return el;
}

/**
 * Keyboard reach. "/" focuses the map's search, links without an href act like links, and with
 * `travel` the arrow keys walk the stars: Enter travels, Backspace goes back, Escape lets go,
 * and + − 0 zoom and centre.
 */
export function initKeyboard(search: HTMLInputElement, onMap: () => boolean, travel?: KeyTravel): void {
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && onMap() && document.activeElement !== search) {
      e.preventDefault();
      search.focus();
    }
  });
  document.querySelectorAll<HTMLAnchorElement>('a:not([href])').forEach((a) => {
    a.tabIndex = 0;
    a.setAttribute('role', 'link');
  });
  document.addEventListener('keydown', (e) => {
    const t = e.target;
    if (e.key === 'Enter' && t instanceof HTMLElement && t.matches('a:not([href])')) t.click();
  });
  if (!travel) return;

  const live = liveRegion();
  const cursor = new StarCursor(travel, (text) => (live.textContent = text));
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || !onMap() || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
    // Enter and Space on a focused button or link belong to that control.
    if ((e.key === 'Enter' || e.key === ' ') && pressable(e.target)) return;
    if (cursor.key(e.key)) e.preventDefault();
  });
  // Moving the mouse hands the highlight back to the pointer.
  document.getElementById('sky')?.addEventListener('pointermove', () => cursor.clear());
}
