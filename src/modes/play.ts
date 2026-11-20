import type { ArticleSummary, Constellation, DataProvider, Suggestion } from '../types';
import { clock, esc } from '../lib';
import { subjectRgb } from '../styles';
import { Engine, type Con } from '../engine';
import { Discovery, Tip, initKeyboard } from '../comforts';
import { legendHtml, panelHtml } from './panel';
import { PICKING_HTML, beginRace, hudHtml, par, randomPair, stepRace, type Race } from './race';

export type Mode = 'explore' | 'race';

/** Wording that depends on where the data comes from. */
export interface SourceCopy {
  /** Shown at the end of the status line, for example "sample data". */
  status: string;
  /** Completes "No article called X ...", for example "in the sample set". */
  missing: string;
  /** The line under the title in the article panel. */
  panelNote: string;
}

const SOON: Record<string, string> = {
  connect: 'Connect two is planned: type two topics and the shortest chain between them lights up.',
  daily: 'Daily constellation is planned: one pair a day, the same for everyone.',
  drift: 'Drift is planned: the map explores itself, like a screensaver.',
};

const DEFAULT_ARTICLE = 'Architecture';

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error('Missing element #' + id);
  return el as T;
}

/**
 * The map screen: it joins the provider, the engine and the page chrome,
 * and runs the Explore and Race modes.
 */
export class Play {
  readonly engine: Engine;
  mode: Mode = 'explore';
  private race: Race | null = null;
  /** Counts race starts, so a slow start that has been overtaken is dropped. */
  private raceSeq = 0;
  private picking = false;
  private readonly discovery = new Discovery();
  private readonly tip: Tip;
  private seq = 0;
  private toastTimer = 0;
  private found: Suggestion[] = [];
  private sel = 0;
  private suggestSeq = 0;
  private summary: ArticleSummary | null = null;
  private readonly gq = $<HTMLInputElement>('gq');
  private readonly gs = $('gsugg');

  constructor(
    private readonly provider: DataProvider,
    private readonly copy: SourceCopy,
    private readonly isOpen: () => boolean,
  ) {
    this.tip = new Tip(
      $('tip'),
      (title) => !!this.race && !this.race.done && title === this.race.target,
      (title, signal) => this.provider.summary(title, signal),
    );
    this.engine = new Engine($<HTMLCanvasElement>('sky'), {
      onPick: (title) => void this.navigate(title),
      onHover: (target, p, w, h) => this.tip.show(target, p, w, h),
      onChange: (cur) => this.changed(cur),
      onTravel: (title, now) => this.travelled(title, now),
      onFrame: (stats, now) => {
        $('gstat').textContent =
          stats.stars + ' stars · ' + stats.memories + (stats.memories === 1 ? ' memory' : ' memories') + ' · ' + this.discovery.label + ' · ' + this.copy.status;
        if (this.race && !this.race.done) {
          const t = document.getElementById('rt');
          if (t) t.textContent = clock(now - this.race.t0);
        }
      },
    });
    this.bind();
  }

  /** The map route opened. */
  enter(): void {
    this.engine.enable();
    if (!this.engine.current) void this.open(DEFAULT_ARTICLE, false);
  }

  /** The map route closed. */
  leave(): void {
    this.engine.disable();
  }

  /** Start over from one article, in Explore unless told otherwise. */
  async open(title: string, explore = true): Promise<void> {
    if (explore) this.setMode('explore');
    const data = await this.load(title);
    if (data) this.reset(data);
  }

  /** Travel to an article from wherever the map is now. */
  async navigate(title: string): Promise<void> {
    const cur = this.engine.current;
    if (!cur) return this.open(title, false);
    if (title === cur.title) return;
    const data = await this.load(title);
    if (!data) return;
    this.discovery.note(data);
    this.engine.travel(data);
  }

  /** Travel to a random article, leaving a race if one is running. */
  async surprise(): Promise<void> {
    const cur = this.engine.current;
    let t: string;
    let n = 0;
    do {
      t = await this.provider.random();
      n++;
    } while (cur && t === cur.title && n < 20);
    if (this.mode !== 'explore') this.setMode('explore');
    if (cur) {
      this.clearSearch();
      await this.navigate(t);
    } else await this.open(t, false);
  }

  /** Start a race between two articles. Par is searched for in the background unless it is already known. */
  async startRace(start: string, target: string, knownPar?: number): Promise<void> {
    const seq = ++this.raceSeq;
    this.picking = false;
    this.setMode('race');
    const data = await this.load(start);
    if (seq !== this.raceSeq) return;
    if (!data) {
      if (!this.race) this.setMode('explore');
      return;
    }
    const race = beginRace(start, target, knownPar ?? null, performance.now());
    this.race = race;
    this.engine.markerTitle = target;
    this.reset(data);
    this.hud();
    if (knownPar !== undefined) return;
    const found = await par(this.provider, start, target);
    if (this.race !== race) return;
    race.par = found;
    this.hud();
  }

  /** Start a race between a freshly picked random pair. */
  async newRace(): Promise<void> {
    const seq = ++this.raceSeq;
    this.setMode('race');
    this.race = null;
    this.engine.markerTitle = null;
    this.picking = true;
    this.hud();
    try {
      const pair = await randomPair(this.provider);
      if (seq === this.raceSeq) await this.startRace(pair.start, pair.target, pair.par);
    } catch {
      if (seq !== this.raceSeq) return;
      this.setMode('explore');
      this.toast('Could not pick a race just now. Try again.');
    }
  }

  /** Run the current race again from its start. */
  async retryRace(): Promise<void> {
    const race = this.race;
    if (!race) return this.newRace();
    await this.startRace(race.start, race.target, race.par !== null && race.par >= 0 ? race.par : undefined);
  }

  setMode(m: Mode): void {
    this.mode = m;
    document.querySelectorAll<HTMLElement>('#modes button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
    if (m !== 'race') {
      this.raceSeq++;
      this.picking = false;
      this.race = null;
      this.engine.markerTitle = null;
      this.hud();
    }
  }

  toast(message: string): void {
    const el = $('toast');
    el.textContent = message;
    el.style.display = 'block';
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      el.style.display = 'none';
    }, 3600);
  }

  /** Tell the reader an article could not be found. */
  missing(query: string): void {
    this.toast('No article called “' + query + '” ' + this.copy.missing + '.');
  }

  /** Fetch a constellation. Only the latest request wins; a failed one shows a note and returns null. */
  private async load(title: string): Promise<Constellation | null> {
    const seq = ++this.seq;
    try {
      const data = await this.provider.constellation(title);
      return seq === this.seq ? data : null;
    } catch {
      if (seq === this.seq) this.missing(title);
      return null;
    }
  }

  private reset(data: Constellation): void {
    this.discovery.note(data);
    this.engine.reset(data);
  }

  private changed(cur: Con): void {
    $('tint').style.color = 'rgb(' + subjectRgb(cur.subject) + ')';
    $('legend').innerHTML = legendHtml(cur);
    this.summary = null;
    this.panel(true);
    void this.provider.summary(cur.title).then(
      (s) => {
        if (this.engine.current === cur) {
          this.summary = s;
          this.panel(false);
        }
      },
      () => undefined,
    );
  }

  private panel(scrollTop: boolean): void {
    const cur = this.engine.current;
    if (!cur) return;
    const el = $('panel');
    el.innerHTML = panelHtml(cur, this.engine.trail, this.engine.visited, this.summary, this.copy.panelNote);
    if (scrollTop) el.scrollTop = 0;
  }

  private travelled(title: string, now: number): void {
    const race = this.race;
    if (!race || race.done) return;
    if (stepRace(race, title, now)) this.engine.markerTitle = null;
    this.hud();
  }

  private hud(): void {
    const el = $('hud');
    if (!this.race) {
      el.className = this.picking ? 'card on' : 'card';
      if (this.picking) el.innerHTML = PICKING_HTML;
      return;
    }
    el.className = 'card on' + (this.race.done ? ' win' : '');
    el.innerHTML = hudHtml(this.race);
  }

  /* ---------- search ---------- */

  private clearSearch(): void {
    this.gq.value = '';
    this.found = [];
    this.gs.classList.remove('open');
    this.gq.blur();
  }

  private choose(title: string): void {
    this.clearSearch();
    if (this.engine.current) void this.navigate(title);
  }

  private async suggest(): Promise<void> {
    const q = this.gq.value.trim();
    const seq = ++this.suggestSeq;
    if (!q) {
      this.found = [];
      this.gs.classList.remove('open');
      return;
    }
    let found: Suggestion[];
    try {
      found = await this.provider.suggest(q);
    } catch {
      found = [];
    }
    if (seq !== this.suggestSeq) return;
    this.found = found;
    this.gs.classList.add('open');
    this.renderSuggestions(q);
  }

  private renderSuggestions(q: string): void {
    const gs = this.gs;
    if (!this.found.length) {
      gs.innerHTML = "<li style='color:var(--space-redlink);cursor:default'>" + esc(q) + '<span>no such article ' + esc(this.copy.missing) + '</span></li>';
      return;
    }
    if (this.sel >= this.found.length) this.sel = 0;
    gs.innerHTML = this.found
      .map((s, i) => {
        const t = s.title;
        const k = t.toLowerCase().indexOf(q.toLowerCase());
        const h = k >= 0 ? esc(t.slice(0, k)) + '<mark>' + esc(t.slice(k, k + q.length)) + '</mark>' + esc(t.slice(k + q.length)) : esc(t);
        return "<li role='option' data-i='" + i + "' class='" + (i === this.sel ? 'on' : '') + "'>" + h + '<span>' + esc(s.description ?? '') + '</span></li>';
      })
      .join('');
  }

  /* ---------- wiring ---------- */

  private bind(): void {
    const { gq, gs, engine } = this;
    gq.addEventListener('input', () => {
      this.sel = 0;
      void this.suggest();
    });
    gq.addEventListener('focus', () => void this.suggest());
    gq.addEventListener('blur', () => {
      setTimeout(() => gs.classList.remove('open'), 150);
    });
    gq.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        gq.blur();
        return;
      }
      if (!this.found.length) return;
      if (e.key === 'ArrowDown') this.sel = (this.sel + 1) % this.found.length;
      else if (e.key === 'ArrowUp') this.sel = (this.sel + this.found.length - 1) % this.found.length;
      else if (e.key === 'Enter') {
        const hit = this.found[this.sel];
        if (hit) this.choose(hit.title);
        return;
      } else return;
      e.preventDefault();
      this.renderSuggestions(gq.value.trim());
    });
    gs.addEventListener('mousedown', (e) => e.preventDefault());
    gs.addEventListener('click', (e) => {
      const li = (e.target as HTMLElement).closest<HTMLElement>('li[data-i]');
      const hit = li ? this.found[Number(li.dataset.i)] : undefined;
      if (hit) this.choose(hit.title);
    });
    initKeyboard(gq, this.isOpen, { map: engine, go: (title) => void this.navigate(title) });

    $('surprise').addEventListener('click', () => void this.surprise());
    $('zin').addEventListener('click', () => engine.zoomBy(1.4));
    $('zout').addEventListener('click', () => engine.zoomBy(1 / 1.4));
    $('zfit').addEventListener('click', () => engine.fit());

    $('panel').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-t]');
      if (b?.dataset.t) void this.navigate(b.dataset.t);
    });
    $('modes').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-mode]');
      const m = b?.dataset.mode;
      if (!m) return;
      const soon = SOON[m];
      if (soon) this.toast(soon);
      else if (m === 'race') void this.newRace();
      else this.setMode('explore');
    });
    $('hud').addEventListener('click', (e) => {
      const id = (e.target as HTMLElement).id;
      if (id === 'again') void this.newRace();
      else if (id === 'retry') void this.retryRace();
      else if (id === 'quit') this.setMode('explore');
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) engine.stop();
      else if (this.isOpen()) engine.kick();
    });
    window.addEventListener('resize', () => {
      if (this.isOpen()) {
        engine.resize();
        engine.kick();
      }
    });
    void document.fonts?.ready.then(() => engine.clearLabelCache());
  }
}
