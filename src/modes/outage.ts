import { backoffMs, diagnose, type Diagnosis, type Outage } from '../data';
import { esc } from '../lib';

/** What the screen says and draws for one way of being cut off from Wikipedia. */
export type Kind = Outage | 'missing';

interface Copy {
  code: string;
  title: string;
  body: string;
  tips: string[];
}

export const COPY: Record<Kind, Copy> = {
  offline: {
    code: 'NO SIGNAL',
    title: 'The sky has gone quiet',
    body: 'Your device cannot reach the internet right now, so there is nothing to draw the map from.',
    tips: [
      'Check that wifi or mobile data is switched on.',
      'If you are on public wifi, open its sign-in page first.',
      'Astris tries again by itself the moment you are back online.',
    ],
  },
  blocked: {
    code: 'BLOCKED',
    title: 'This network is blocking Wikipedia',
    body: 'The internet works here, but Wikipedia is not getting through. School, work and public networks often filter it.',
    tips: ['Switch to another wifi network or to mobile data.', 'Turn off a VPN or content filter if you are running one.', 'Astris tries again when your connection changes.'],
  },
  portal: {
    code: 'SIGN IN',
    title: 'The wifi wants a word first',
    body: 'Something on this network answered instead of Wikipedia, usually a sign-in or terms page for public wifi.',
    tips: ['Open any web page in a new tab and accept the wifi terms or sign in.', 'Then come back here. Astris tries again on its own.'],
  },
  timeout: {
    code: 'TOO SLOW',
    title: 'Wikipedia took too long to answer',
    body: 'Your connection is up, but the answer never arrived in time. A weak signal or a congested network does this.',
    tips: ['Move closer to the router, or switch to mobile data.', 'Give it a moment and try again.'],
  },
  busy: {
    code: 'SLOW DOWN',
    title: 'Wikipedia asked for a pause',
    body: 'Too many requests arrived too quickly, so Wikipedia is making Astris wait its turn. Nothing is broken on your side.',
    tips: ['Wait a few seconds. Astris resumes by itself.', 'On a shared network, other visitors count towards the same limit.'],
  },
  down: {
    code: 'WIKIPEDIA DOWN',
    title: 'Wikipedia is having a bad moment',
    body: 'Your connection is fine, but Wikipedia is answering with an error. These usually clear up within minutes.',
    tips: ['Try again in a minute or two.', 'Astris keeps trying with longer and longer gaps.'],
  },
  missing: {
    code: 'NO SUCH STAR',
    title: 'No article by that name',
    body: 'Wikipedia has no article with that exact title. Check the spelling, or search for a nearby word.',
    tips: ['Try the search box: it suggests titles as you type.', 'Or let a random article pick for you.'],
  },
};

const STATUS_URL = 'https://www.wikimediastatus.net/';

/** The little constellation drawn for each case: a star is a circle, a line joins two. Colours come from the CSS classes. */
function art(kind: Kind): string {
  const star = (x: number, y: number, r: number, cls = ''): string => "<circle class='s " + cls + "' cx='" + x + "' cy='" + y + "' r='" + r + "'/>";
  const line = (a: number[], b: number[], cls = ''): string => "<line class='l " + cls + "' x1='" + a[0] + "' y1='" + a[1] + "' x2='" + b[0] + "' y2='" + b[1] + "'/>";
  const arc = (cx: number, cy: number, r: number, n: number, lit: string): { pts: number[][]; svg: string } => {
    const pts: number[][] = [];
    for (let i = 0; i < n; i++) {
      const a = ((-140 + (100 * i) / (n - 1)) * Math.PI) / 180;
      pts.push([Math.round(cx + r * Math.cos(a)), Math.round(cy + r * Math.sin(a))]);
    }
    let svg = '';
    pts.forEach((p, i) => {
      const next = pts[i + 1];
      if (next) svg += line(p, next, 'dim dash');
      svg += star(p[0] ?? 0, p[1] ?? 0, 3, lit);
    });
    return { pts, svg };
  };
  let g = '';
  switch (kind) {
    case 'offline': {
      g += star(160, 150, 5.5, 'lit pulse');
      g += arc(160, 150, 38, 3, 'dim blink b1').svg + arc(160, 150, 76, 4, 'dim blink b2').svg + arc(160, 150, 114, 5, 'dim blink b3').svg;
      break;
    }
    case 'blocked': {
      const left = [
        [50, 100],
        [85, 62],
        [105, 112],
        [135, 80],
      ];
      left.forEach((p, i) => {
        const n = left[i + 1];
        if (n) g += line(p, n);
        g += star(p[0] ?? 0, p[1] ?? 0, i === 3 ? 4.5 : 3.5, 'lit');
      });
      for (let y = 30; y <= 150; y += 30) g += star(172, y, 2.6, 'dim wall');
      g += line([172, 22], [172, 158], 'dim dash');
      g += line([135, 80], [160, 80], 'bump');
      g += "<path class='x' d='M164 72l16 16m0-16l-16 16'/>";
      [
        [215, 60],
        [250, 105],
        [228, 140],
        [275, 70],
      ].forEach((p) => (g += star(p[0] ?? 0, p[1] ?? 0, 3.5, 'dim')));
      break;
    }
    case 'portal': {
      const body = [
        [118, 92],
        [202, 92],
        [202, 152],
        [118, 152],
      ];
      body.forEach((p, i) => {
        g += line(p, body[(i + 1) % 4] ?? p, 'lit');
        g += star(p[0] ?? 0, p[1] ?? 0, 4, 'lit');
      });
      g += "<path class='l lit' d='M134 92 V70 a26 26 0 0 1 52 0 V92' fill='none'/>";
      g += star(134, 70, 3, 'lit') + star(186, 70, 3, 'lit') + star(160, 44, 3.5, 'lit');
      g += star(160, 118, 6, 'lit pulse') + line([160, 118], [160, 138], 'lit');
      break;
    }
    case 'timeout': {
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4 - Math.PI / 2;
        const p = [160 + 62 * Math.cos(a), 90 + 62 * Math.sin(a)].map(Math.round);
        const q = [160 + 62 * Math.cos(a + Math.PI / 4), 90 + 62 * Math.sin(a + Math.PI / 4)].map(Math.round);
        g += line(p, q, 'dim') + star(p[0] ?? 0, p[1] ?? 0, i === 0 ? 4.5 : 3.2, i === 0 ? 'lit' : '');
      }
      g += line([160, 90], [160, 44], 'lit') + line([160, 90], [190, 108], 'lit') + star(160, 90, 4.5, 'lit');
      g += "<g class='orbit'>" + star(160, 22, 4, 'lit comet') + '</g>';
      break;
    }
    case 'busy': {
      [128, 192].forEach((x) => {
        for (let y = 56; y <= 128; y += 24) {
          g += star(x, y, 3.4, 'lit');
          if (y < 128) g += line([x, y], [x, y + 24], 'lit');
        }
      });
      for (let i = 0; i < 5; i++) {
        const y = 40 + i * 24;
        g += line([34 + i * 6, y + 6], [100, 92], 'dim dash') + star(34 + i * 6, y + 6, 2.4, 'dim blink b' + (1 + (i % 3)));
      }
      g += "<circle class='ring' cx='160' cy='92' r='74' pathLength='100'/>";
      break;
    }
    case 'down': {
      const ring: number[][] = [];
      for (let i = 0; i < 7; i++) {
        const a = (i * 2 * Math.PI) / 7 - Math.PI / 2;
        ring.push([Math.round(160 + 70 * Math.cos(a)), Math.round(92 + 70 * Math.sin(a))]);
      }
      ring.forEach((p, i) => {
        g += line(p, ring[(i + 1) % 7] ?? p, i % 3 === 2 ? 'dim dash' : '') + star(p[0] ?? 0, p[1] ?? 0, 3.6, i % 3 === 2 ? 'dim' : 'lit');
      });
      g += "<path class='l crack' d='M160 92 l-10 -14 l9 -6 l-8 -16 M160 92 l12 10 l-6 8 l10 14 M160 92 l-14 12 l-18 2'/>";
      g += star(160, 92, 6, 'dim blink b2') + star(138, 70, 2, 'dim frag') + star(184, 108, 2.2, 'dim frag') + star(150, 120, 1.8, 'dim frag');
      break;
    }
    case 'missing': {
      g += "<circle class='hole' cx='160' cy='92' r='56'/>";
      g += "<path class='l dim dash' d='M138 66 q0 -22 24 -22 t24 22 q0 16 -24 26 v14' fill='none'/>";
      g += star(162, 128, 4, 'lit drift');
      [
        [70, 50],
        [250, 60],
        [90, 140],
        [240, 130],
        [40, 100],
      ].forEach((p, i) => (g += star(p[0] ?? 0, p[1] ?? 0, 2.2, 'dim blink b' + (1 + (i % 3)))));
      break;
    }
  }
  return "<svg class='art " + kind + "' viewBox='0 0 320 180' role='img' aria-hidden='true' focusable='false'>" + g + '</svg>';
}

/** Markup for one screen. The query is the only reader-typed text, and goes through esc(). */
export function outageHtml(kind: Kind, o: { query?: string; keep: boolean }): string {
  const c = COPY[kind];
  const title = kind === 'missing' && o.query ? 'No article called “' + esc(o.query) + '”' : esc(c.title);
  const tips = c.tips.map((t) => '<li>' + esc(t) + '</li>').join('');
  const retry = kind === 'missing' ? '' : "<button type='button' class='btn go' data-outage='retry'>Try again</button>";
  const random = kind === 'missing' ? "<button type='button' class='btn go' data-outage='random'>Random article</button>" : '';
  const keep = o.keep ? "<button type='button' class='btn' data-outage='keep'>Keep exploring</button>" : "<button type='button' class='btn' data-outage='home'>Main page</button>";
  const status = kind === 'down' ? "<a class='lk' href='" + STATUS_URL + "' target='_blank' rel='noopener'>Wikimedia status</a>" : '';
  return (
    art(kind) +
    "<p class='code'>" +
    esc(c.code) +
    '</p><h2>' +
    title +
    '</h2><p class="sub">' +
    esc(c.body) +
    '</p><ul class="tips">' +
    tips +
    "</ul><div class='acts'>" +
    retry +
    random +
    keep +
    status +
    "</div><p class='live' role='status'></p>"
  );
}

export interface LoopOptions {
  kind: Outage;
  /** Runs the failed work again. Rejects if it fails again. */
  attempt: () => Promise<void>;
  onFail: (err: unknown) => void;
  onHealed: () => void;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => number;
  clearTimer?: (id: number) => void;
}

/** Tries again on its own: after a growing pause, and at once when told the connection may be back. */
export class RetryLoop {
  attempts = 0;
  trying = false;
  /** When the next automatic try is due, in `now()` terms, or null when none is waiting. */
  nextAt: number | null = null;
  private timer: number | null = null;
  private stopped = false;
  private lastStart = -Infinity;
  private readonly now: () => number;
  private readonly setT: (fn: () => void, ms: number) => number;
  private readonly clearT: (id: number) => void;

  constructor(private readonly o: LoopOptions) {
    this.now = o.now ?? Date.now;
    this.setT = o.setTimer ?? ((fn, ms) => Number(setTimeout(fn, ms)));
    this.clearT = o.clearTimer ?? ((id) => clearTimeout(id));
  }

  start(): void {
    this.schedule();
  }

  stop(): void {
    this.stopped = true;
    this.cancel();
  }

  /** Try right now. A second call while one is running, or within two seconds of the last, does nothing unless forced. */
  async retryNow(force = false): Promise<void> {
    if (this.stopped || this.trying) return;
    if (!force && this.now() - this.lastStart < 2000) return;
    this.cancel();
    this.trying = true;
    this.lastStart = this.now();
    try {
      await this.o.attempt();
      if (this.stopped) return;
      this.stop();
      this.o.onHealed();
    } catch (err) {
      if (this.stopped) return;
      this.attempts++;
      this.o.onFail(err);
      this.schedule();
    } finally {
      this.trying = false;
    }
  }

  private schedule(): void {
    this.cancel();
    if (this.stopped) return;
    const ms = backoffMs(this.o.kind, this.attempts);
    this.nextAt = this.now() + ms;
    this.timer = this.setT(() => void this.retryNow(true), ms);
  }

  private cancel(): void {
    if (this.timer !== null) this.clearT(this.timer);
    this.timer = null;
    this.nextAt = null;
  }
}

export interface ScreenOptions {
  /** The main page was asked for. */
  home: () => void;
  /** A random article was asked for (the missing-article screen). */
  random: () => void;
}

export interface ShowOptions {
  /** Work to repeat. Rejects when it fails again. */
  retry?: () => Promise<void>;
  /** The reader's typed text, for the missing-article screen. */
  query?: string;
  /** A map is already on screen, so the screen can be put away to keep exploring it. */
  keep: boolean;
}

/** The full-screen error card over the map. One at a time; showing another replaces it. */
export class OutageScreen {
  private loop: RetryLoop | null = null;
  private kind: Kind | null = null;
  private opts: ShowOptions | null = null;
  private tick = 0;
  private readonly onOnline = (): void => void this.loop?.retryNow(true);
  private readonly onOffline = (): void => this.swap('offline');
  private readonly onVisible = (): void => {
    if (!document.hidden) void this.loop?.retryNow();
  };

  constructor(
    private readonly el: HTMLElement,
    private readonly o: ScreenOptions,
  ) {
    el.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-outage]')?.dataset.outage;
      if (act === 'retry') void this.loop?.retryNow(true);
      else if (act === 'keep') this.hide();
      else if (act === 'home') {
        this.hide();
        this.o.home();
      } else if (act === 'random') {
        this.hide();
        this.o.random();
      }
    });
  }

  get open(): boolean {
    return !this.el.hidden;
  }

  get current(): Kind | null {
    return this.open ? this.kind : null;
  }

  show(kind: Kind, opts: ShowOptions): void {
    this.stopLoop();
    this.kind = kind;
    this.opts = opts;
    this.el.hidden = false;
    this.el.dataset.kind = kind;
    this.el.classList.remove('healed');
    this.el.innerHTML = outageHtml(kind, opts);
    this.el.classList.toggle('over', opts.keep);
    if (kind === 'missing' || !opts.retry) return this.say('');
    const retry = opts.retry;
    this.loop = new RetryLoop({
      kind,
      attempt: retry,
      onFail: (err) => {
        void diagnose(err).then((d) => this.swap(d));
        this.paint();
      },
      onHealed: () => this.healed(),
    });
    this.loop.start();
    window.addEventListener('online', this.onOnline);
    window.addEventListener('offline', this.onOffline);
    document.addEventListener('visibilitychange', this.onVisible);
    this.tick = window.setInterval(() => this.paint(), 500);
    this.paint();
    this.el.querySelector<HTMLElement>('[data-outage="retry"]')?.focus({ preventScroll: true });
  }

  /** The cause may change between tries (offline, then blocked once wifi is back). Redraw only when it does. */
  private swap(d: Diagnosis): void {
    if (!this.open || !this.opts || d === 'cancelled' || d === 'missing' || d === this.kind || !this.loop) return;
    const loop = this.loop;
    const opts = this.opts;
    const attempts = loop.attempts;
    this.show(d, opts);
    if (this.loop) this.loop.attempts = attempts;
  }

  /** The line under the buttons: what Astris is doing about it. */
  private paint(): void {
    const loop = this.loop;
    if (!loop || !this.open) return;
    if (loop.trying) return this.say('Checking the sky…');
    const wait = loop.nextAt === null ? 0 : Math.max(0, Math.ceil((loop.nextAt - Date.now()) / 1000));
    const lead = this.kind === 'offline' ? 'Waiting for your connection. ' : '';
    this.say(lead + 'Trying again in ' + wait + 's' + (loop.attempts ? ' · attempt ' + (loop.attempts + 1) : ''));
  }

  private say(text: string): void {
    const live = this.el.querySelector('.live');
    if (live && live.textContent !== text) live.textContent = text;
  }

  /** The stars relight for a moment, then the screen goes away. */
  private healed(): void {
    this.stopLoop();
    this.el.classList.add('healed');
    this.say('Back in orbit.');
    window.setTimeout(() => {
      if (this.el.classList.contains('healed')) this.hide();
    }, 900);
  }

  hide(): void {
    this.stopLoop();
    this.el.hidden = true;
    this.el.classList.remove('healed');
    this.kind = null;
  }

  private stopLoop(): void {
    this.loop?.stop();
    this.loop = null;
    window.clearInterval(this.tick);
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('offline', this.onOffline);
    document.removeEventListener('visibilitychange', this.onVisible);
  }
}
