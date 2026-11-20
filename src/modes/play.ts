import type { ArticleSummary, Constellation, DataProvider, Suggestion } from '../types';
import { esc } from '../lib';
import { replay, subjectRgb } from '../styles';
import { Engine, type Con } from '../engine';
import { Atlas, Collection } from '../sky';
import { Discovery, Share, Tip, firstLine, initKeyboard } from '../comforts';
import { Connect, connectHtml, type ConnectState } from './connect';
import { dailyPair, recent, saveDaily, shareText, streak } from './daily';
import { DRIFT_HTML, DRIFT_MS, nextStop } from './drift';
import { UNREACHABLE_NOTE, failureOf } from './failure';
import { legendHtml, panelHtml, suggestNext } from './panel';
import { graphOf, route } from './graph';
import { NO_RULES, REVEAL_BUDGET, loadRules, refusal, revealText, saveRules, type Rules } from './rules';
import { PAR_BEAM, PAR_DEPTH, PICKING_HTML, beginRace, clockText, expire, hudHtml, solvePar, randomPair, stepRace, type Pair, type Race } from './race';

export type Mode = 'explore' | 'race' | 'daily' | 'connect' | 'drift';

/** Wording that depends on where the data comes from. */
export interface SourceCopy {
  /** Shown at the end of the status line, for example "sample data". */
  status: string;
  /** Completes "No article called X ...", for example "in the sample set". */
  missing: string;
  /** The line under the title in the article panel. */
  panelNote: string;
}

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
  /** A random pair picked ahead of time, so the next new chain starts at once. */
  private ahead: Promise<Pair> | null = null;
  private readonly connect: Connect;
  private readonly discovery = new Discovery();
  private readonly collection = new Collection();
  private atlas: Atlas | null = null;
  private readonly tip: Tip;
  private readonly share: Share;
  private seq = 0;
  private driftTimer = 0;
  private driftSeen: string[] = [];
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
      () => this.engine.current?.title ?? null,
      (title) => this.engine.visited.has(title),
    );
    this.engine = new Engine($<HTMLCanvasElement>('sky'), {
      onPick: (title) => {
        this.stopDrift();
        void this.navigate(title);
      },
      onHover: (target, p, w, h) => this.tip.show(target, p, w, h),
      onChange: (cur) => this.changed(cur),
      onTravel: (title, now) => this.travelled(title, now),
      onFrame: (stats, now) => {
        $('gstat').textContent =
          stats.stars + ' stars · ' + stats.memories + (stats.memories === 1 ? ' memory' : ' memories') + ' · ' + this.discovery.label + ' · ' + this.copy.status;
        if (this.race && !this.race.done) {
          const t = document.getElementById('rt');
          if (t) t.textContent = clockText(this.race, now);
          if (expire(this.race, now)) {
            this.engine.markerTitle = null;
            this.hud();
          }
        }
      },
    });
    this.share = new Share({
      host: $('surprise').parentElement ?? $('play'),
      state: () => {
        const cur = this.engine.current;
        if (this.race) return { mode: 'race', start: this.race.start, target: this.race.target };
        return cur ? { mode: 'explore', article: cur.title } : null;
      },
      onMap: this.isOpen,
      toast: (message) => this.toast(message),
    });
    this.connect = new Connect({
      provider: this.provider,
      current: () => this.engine.current?.title ?? null,
      open: async (title) => {
        const data = await this.load(title);
        if (data) this.reset(data);
        return data ? data.center.title : null;
      },
      travel: async (title) => {
        await this.navigate(title);
        return this.engine.current?.title === title;
      },
      mark: (title) => {
        this.engine.markerTitle = title;
      },
      render: (state) => this.connectCard(state),
      wait: (ms) => new Promise((done) => window.setTimeout(done, ms)),
    });
    this.bind();
  }

  /** The map route opened. */
  enter(): void {
    this.engine.enable();
    this.share.sync();
    if (!this.engine.current) void this.open(DEFAULT_ARTICLE, false);
  }

  /** The map route closed. */
  leave(): void {
    this.atlas?.close(false);
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
    const race = this.race;
    if (race && !race.done) {
      const subject = cur.nodes.find((n) => n.title === title)?.subject;
      const why = refusal(race.rules, title, race.target, subject, race.seen, race.revisits);
      if (why) return this.toast(why);
    }
    const data = await this.load(title);
    if (!data) return;
    this.collect(data);
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
  async startRace(start: string, target: string, knownPar?: number, day?: number, hard = false, rules: Rules = day === undefined ? loadRules() : NO_RULES): Promise<void> {
    const seq = ++this.raceSeq;
    this.picking = false;
    this.setMode(day === undefined ? 'race' : 'daily');
    const data = await this.load(start);
    if (seq !== this.raceSeq) return;
    if (!data) {
      if (!this.race) this.setMode('explore');
      return;
    }
    // The provider follows redirects, so race on the titles it actually uses.
    const race = beginRace(data.center.title, target, knownPar ?? null, performance.now(), day, hard, rules);
    this.race = race;
    this.engine.markerTitle = target;
    this.reset(data);
    this.hud();
    void this.provider.summary(target).then(
      (s) => {
        if (this.race !== race || race.done) return;
        if (s.title && s.title !== race.target) {
          race.target = s.title;
          this.engine.markerTitle = s.title;
        }
        race.hint = firstLine(s.extract, 90);
        this.hud();
      },
      () => undefined,
    );
    const found = await solvePar(this.provider, race.start, target);
    if (this.race !== race) return;
    if (found.par >= 0 || knownPar === undefined) {
      race.par = found.par;
      race.parExact = found.exact;
    }
    if (found.route) race.route = found.route;
    this.hud();
  }

  /** Open Connect two, optionally with both articles already chosen. */
  async startConnect(from?: string, to?: string): Promise<void> {
    this.setMode('connect');
    this.connect.start();
    if (from && to) await this.connect.run(from, to);
  }

  /** Start today's race: one pair a day, the same for every visitor. */
  async startDaily(hard = false): Promise<void> {
    const pair = dailyPair(undefined, hard);
    await this.startRace(pair.start, pair.target, undefined, pair.day, hard);
  }

  /** A random pair: the one picked ahead if there is one, otherwise a fresh pick. */
  private pair(): Promise<Pair> {
    const next = this.ahead ?? randomPair(this.provider);
    this.ahead = null;
    return next;
  }

  /** Pick the next pair in the background, once. A failed pick is forgotten. */
  private prepare(): void {
    if (this.ahead) return;
    const pick = randomPair(this.provider);
    this.ahead = pick;
    pick.catch(() => {
      if (this.ahead === pick) this.ahead = null;
    });
  }

  /** Connect two articles chosen at random, in one click. */
  async surprisePair(): Promise<void> {
    if (this.mode !== 'connect') this.startConnect().catch(() => undefined);
    await this.connect.surprise(() => this.pair());
  }

  /** The fastest way to a new chain: a new race, or a new pair in Connect two. */
  newChain(): Promise<void> {
    return this.mode === 'connect' ? this.surprisePair() : this.newRace();
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
      const pair = await this.pair();
      if (seq === this.raceSeq) await this.startRace(pair.start, pair.target, pair.par);
    } catch {
      if (seq !== this.raceSeq) return;
      this.setMode('explore');
      this.toast('Could not pick a race just now. Try again.');
    }
  }

  /** Turn a rule on or off. The same race starts over so the new rule applies from the first click. */
  private async toggleRule(rule: keyof Rules): Promise<void> {
    const race = this.race;
    if (!race || race.day !== undefined) return;
    const rules = { ...race.rules, [rule]: !race.rules[rule] };
    saveRules(rules);
    await this.startRace(race.start, race.target, race.par !== null && race.par >= 0 ? race.par : undefined, undefined, false, rules);
  }

  /** Reveal: spend one use to learn how far the target is from here and the first step to take. */
  private async reveal(): Promise<void> {
    const race = this.race;
    const cur = this.engine.current;
    if (!race || race.done || !cur || !race.reveals) return;
    race.note = 'Looking for a route…';
    this.hud();
    const chain = await route(graphOf(this.provider), cur.title, race.target, { maxDepth: PAR_DEPTH, budget: REVEAL_BUDGET, beam: PAR_BEAM });
    if (this.race !== race || race.done || this.engine.current !== cur) return;
    if (chain) {
      race.reveals--;
      race.revealed++;
    }
    race.note = revealText(chain);
    this.hud();
  }

  /** Copy the finished daily's result grid, which names neither article, to the clipboard. */
  async shareDaily(): Promise<void> {
    const race = this.race;
    if (!race?.done || race.day === undefined || !race.best) return;
    const text = shareText(race.day, race.hard === true, race.best, location.origin + '/play?daily=' + (race.hard ? 'hard' : '1'));
    const copied = await navigator.clipboard.writeText(text).then(
      () => true,
      () => false,
    );
    this.toast(copied ? 'Result copied. Paste it anywhere.' : 'Could not reach the clipboard.');
  }

  /** Run the current race again from its start. */
  async retryRace(): Promise<void> {
    const race = this.race;
    if (!race) return this.newRace();
    await this.startRace(race.start, race.target, race.par !== null && race.par >= 0 ? race.par : undefined, race.day, race.hard, race.rules);
  }

  /** Drift: the map travels to a neighbouring article every few seconds until the reader acts. */
  startDrift(): void {
    this.setMode('drift');
    this.hud();
    const step = async (): Promise<void> => {
      const cur = this.engine.current?.title;
      if (cur) {
        this.driftSeen = [...this.driftSeen.slice(-8), cur];
        const next = nextStop(await this.provider.neighbours(cur).catch(() => []), this.driftSeen);
        if (this.mode !== 'drift') return;
        if (next) await this.navigate(next);
        else await this.navigate(await this.provider.random());
      }
      if (this.mode === 'drift') this.driftTimer = window.setTimeout(() => void step(), DRIFT_MS);
    };
    this.driftTimer = window.setTimeout(() => void step(), 1200);
  }

  private stopDrift(): void {
    clearTimeout(this.driftTimer);
    if (this.mode === 'drift') this.setMode('explore');
  }

  setMode(m: Mode): void {
    if (m !== 'drift') clearTimeout(this.driftTimer);
    this.mode = m;
    document.querySelectorAll<HTMLElement>('#modes button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
    if (m !== 'connect' && this.connect.state) {
      this.connect.stop();
      this.engine.markerTitle = null;
      this.hud();
    }
    if (m === 'explore' || m === 'connect') {
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
    } catch (err) {
      const why = failureOf(err);
      if (seq === this.seq && why === 'missing') this.missing(title);
      else if (seq === this.seq && why === 'unreachable') this.toast(UNREACHABLE_NOTE);
      return null;
    }
  }

  /** Count the constellation as discovered and add its centre to the sky map. */
  private collect(data: Constellation): void {
    this.discovery.note(data);
    const r = this.collection.visit(data.center.title, data.center.subject);
    const said: string[] = [];
    if (r.lit) said.push('New region lit: ' + r.lit);
    for (const a of r.unlocked) said.push('Achievement: ' + a.name);
    if (said.length) this.toast(said.join(' · '));
    this.atlas?.refresh();
  }

  private reset(data: Constellation): void {
    this.collect(data);
    this.engine.reset(data);
  }

  private changed(cur: Con): void {
    $('tint').style.color = 'rgb(' + subjectRgb(cur.subject) + ')';
    $('legend').innerHTML = legendHtml(cur);
    this.summary = null;
    this.panel(true);
    this.share.sync();
    const show = (s: ArticleSummary): void => {
      if (this.engine.current !== cur) return;
      this.summary = s;
      this.panel(false);
    };
    // A summary that cannot be fetched leaves the rest of the panel in place.
    void this.provider.summary(cur.title).then(show, () => show({ title: cur.title, extract: '', url: '' }));
  }

  private panel(scrollTop: boolean): void {
    const cur = this.engine.current;
    if (!cur) return;
    const el = $('panel');
    el.innerHTML = panelHtml(cur, this.engine.trail, this.engine.visited, this.summary, this.copy.panelNote);
    if (scrollTop) {
      el.scrollTop = 0;
      replay(el, 'swap');
    }
  }

  private travelled(title: string, now: number): void {
    const race = this.race;
    if (!race || race.done) return;
    if (stepRace(race, title, now)) {
      this.engine.markerTitle = null;
      if (race.day !== undefined) {
        const hard = race.hard === true;
        race.best = saveDaily(race.day, { clicks: race.clicks, time: race.time, ...(race.par !== null && race.par > 0 ? { par: race.par } : {}) }, undefined, hard);
        race.streak = streak(race.day);
        race.calendar = recent(race.day);
      }
      this.prepare();
    }
    this.hud();
  }

  private connectCard(state: ConnectState | null): void {
    const el = $('hud');
    el.className = state ? 'card on connect' : 'card';
    if (state) el.innerHTML = connectHtml(state);
    if (state?.step === 'form') el.querySelector<HTMLInputElement>(state.from ? "input[name='to']" : "input[name='from']")?.focus();
  }

  /** Fill the Connect two inputs' shared suggestion list as the reader types. */
  private async connectSuggest(input: HTMLInputElement): Promise<void> {
    const q = input.value.trim();
    const seq = ++this.suggestSeq;
    // An empty field offers the best next stars from the map, so a pair can be filled in without typing.
    const cur = this.engine.current;
    const found = q ? await this.provider.suggest(q).catch(() => []) : cur ? suggestNext(cur.nodes, this.engine.visited, 8) : [];
    const list = document.getElementById('clist');
    if (list && seq === this.suggestSeq)
      list.innerHTML = found.map((f) => '<option value="' + esc(f.title) + '"' + (f.description ? ' label="' + esc(f.description) + '"' : '') + '></option>').join('');
  }

  private hud(): void {
    const el = $('hud');
    this.share.sync();
    if (this.connect.state) return;
    if (!this.race && this.mode === 'drift') {
      el.className = 'card on';
      el.innerHTML = DRIFT_HTML;
      return;
    }
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
      // An empty box offers the best next stars, so a new direction is one click away.
      const cur = this.engine.current;
      this.found = cur ? suggestNext(cur.nodes, this.engine.visited) : [];
      this.gs.classList.toggle('open', this.found.length > 0);
      this.renderSuggestions('');
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
        const k = q ? t.toLowerCase().indexOf(q.toLowerCase()) : -1;
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
      if (!this.found.length) {
        // Enter on text with no suggestion yet still tries the article: the provider follows redirects.
        if (e.key === 'Enter' && gq.value.trim()) this.choose(gq.value.trim());
        return;
      }
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
    initKeyboard(gq, () => this.isOpen() && !this.atlas?.isOpen, { map: engine, go: (title) => void this.navigate(title) });

    document.addEventListener('keydown', (e) => {
      const t = e.target;
      const typing = t instanceof HTMLElement && (t.isContentEditable || t.matches('input, textarea, select, button, a'));
      if (e.key === 'n' && this.isOpen() && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        void this.newChain();
      }
    });
    const atlas = new Atlas({ collection: this.collection, open: (title) => void this.open(title) });
    this.atlas = atlas;
    $('skyBtn').addEventListener('click', () => (atlas.isOpen ? atlas.close() : atlas.open()));
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
      if (m === 'drift') this.startDrift();
      else if (m === 'race') void this.newRace();
      else if (m === 'daily') void this.startDaily();
      else if (m === 'connect') void this.startConnect();
      else this.setMode('explore');
    });
    $('hud').addEventListener('submit', (e) => {
      e.preventDefault();
      const data = new FormData(e.target as HTMLFormElement);
      void this.connect.run(String(data.get('from') ?? ''), String(data.get('to') ?? ''));
    });
    $('hud').addEventListener('focusin', (e) => {
      if (e.target instanceof HTMLInputElement && !e.target.value) void this.connectSuggest(e.target);
    });
    $('hud').addEventListener('input', (e) => {
      if (e.target instanceof HTMLInputElement) void this.connectSuggest(e.target);
    });
    $('hud').addEventListener('click', (e) => {
      const id = (e.target as HTMLElement).id;
      const rule = (e.target as HTMLElement).closest<HTMLElement>('[data-rule]')?.dataset.rule;
      if (rule === 'places' || rule === 'backtracks' || rule === 'blitz') return void this.toggleRule(rule);
      const hop = (e.target as HTMLElement).closest<HTMLElement>('[data-t]')?.dataset.t;
      if (hop) {
        this.connect.halt();
        void this.navigate(hop);
      } else if (id === 'creplay') void this.connect.replay();
      else if (id === 'cstop') this.connect.halt();
      else if (id === 'cnew') this.connect.start();
      else if (id === 'csurprise') void this.surprisePair();
      else if (id === 'reveal') void this.reveal();
      else if (id === 'again') void this.newRace();
      else if (id === 'retry') void this.retryRace();
      else if (id === 'dtoggle') void this.startDaily(!this.race?.hard);
      else if (id === 'share') void this.shareDaily();
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
