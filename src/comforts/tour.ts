/** One step of the first-visit tutorial. */
export interface TourStep {
  /** What the reader does to finish the step. */
  on: 'travel' | 'look' | 'search' | 'button';
  title: string;
  body: string;
}

export const TOUR_STEPS: readonly TourStep[] = [
  { on: 'travel', title: 'Click a star', body: 'Each glowing dot is an article this one links to. Click one to travel there.' },
  { on: 'look', title: 'Look around', body: 'Drag the sky to pan it. Scroll, or pinch, to zoom in and out.' },
  { on: 'search', title: 'Search anything', body: 'Press / or tap the search box, then type any topic to jump straight to it.' },
  { on: 'button', title: 'Try a race', body: 'Get from one article to another in the fewest clicks. Ready for one?' },
];

export const TOUR_KEY = 'astris:tour';

interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStore(): Store | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export interface TourOptions {
  /** Where the card goes. */
  host: HTMLElement;
  /** The map, for pan and zoom. */
  canvas: HTMLElement;
  /** The search box. */
  search: HTMLElement;
  /** Called when the reader picks "Start a race" on the last step. */
  onRace: () => void;
  store?: Store | null;
}

/**
 * A short tutorial that teaches by doing: each step waits for the reader to click, drag or search,
 * then moves on. It never blocks the map. It shows itself once, on a first visit, and can be reopened.
 */
export class Tour {
  private step = -1;
  private readonly el: HTMLElement;
  private readonly store: Store | null;
  private dragFrom: { x: number; y: number } | null = null;

  constructor(private readonly o: TourOptions) {
    this.store = o.store === undefined ? browserStore() : o.store;
    this.el = document.createElement('div');
    this.el.id = 'tour';
    this.el.className = 'card';
    this.el.setAttribute('role', 'region');
    this.el.setAttribute('aria-label', 'How to play');
    o.host.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-tour]')?.dataset.tour;
      if (act === 'skip') this.finish();
      else if (act === 'next') this.advance('button');
      else if (act === 'race') {
        this.finish();
        o.onRace();
      }
    });
    o.canvas.addEventListener('wheel', () => this.advance('look'), { passive: true });
    o.canvas.addEventListener('pointerdown', (e) => {
      this.dragFrom = { x: e.clientX, y: e.clientY };
    });
    o.canvas.addEventListener('pointermove', (e) => {
      if (this.dragFrom && Math.hypot(e.clientX - this.dragFrom.x, e.clientY - this.dragFrom.y) > 12) {
        this.dragFrom = null;
        this.advance('look');
      }
    });
    o.canvas.addEventListener('pointerup', () => {
      this.dragFrom = null;
    });
    o.search.addEventListener('focus', () => this.advance('search'));
  }

  /** True while the tutorial is showing. */
  get open(): boolean {
    return this.step >= 0;
  }

  /** True when the reader has already seen or skipped the tutorial. */
  get seen(): boolean {
    try {
      return this.store?.getItem(TOUR_KEY) === 'done';
    } catch {
      return false;
    }
  }

  /** Show the tutorial from its first step. */
  start(): void {
    this.step = 0;
    this.render();
  }

  /** Close the tutorial for good. */
  finish(): void {
    this.step = -1;
    this.el.classList.remove('on');
    this.o.search.classList.remove('tour-pulse');
    try {
      this.store?.setItem(TOUR_KEY, 'done');
    } catch {
      /* private mode: it will show again next visit */
    }
  }

  /** The reader did something. Moves on when it is what the current step waits for. */
  advance(what: TourStep['on']): void {
    const cur = TOUR_STEPS[this.step];
    if (!cur || cur.on !== what) return;
    this.step++;
    this.render();
  }

  private render(): void {
    const cur = TOUR_STEPS[this.step];
    if (!cur) return this.finish();
    const last = this.step === TOUR_STEPS.length - 1;
    const dots = TOUR_STEPS.map((_, i) => "<i class='" + (i === this.step ? 'cur' : i < this.step ? 'done' : '') + "'></i>").join('');
    this.el.innerHTML =
      "<div class='tdots' aria-hidden='true'>" +
      dots +
      '</div><b>' +
      cur.title +
      '</b><p>' +
      cur.body +
      "</p><div class='tact'>" +
      (last ? "<button class='gbtn' type='button' data-tour='race'>Start a race</button>" : '') +
      "<button class='lk' type='button' data-tour='skip'>" +
      (last ? 'Maybe later' : 'Skip tutorial') +
      '</button></div>';
    this.el.classList.add('on');
    this.o.search.classList.toggle('tour-pulse', cur.on === 'search');
    this.el.classList.remove('swap');
    void this.el.offsetWidth;
    this.el.classList.add('swap');
  }
}
