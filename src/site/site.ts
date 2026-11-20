import type { DataProvider } from '../types';
import { prefersReducedMotion, subjectDotsHtml, subjectKeyHtml } from '../styles';
import { MiniMap } from '../engine';
import { dailyPair, par, type Play } from '../modes';
import { articleOf, dispatchPlayLink, isRouteName, pathOf, racePairOf, routeOf, type RouteName } from './router';

/** The article at the centre of the main page's small map. */
const TODAY = 'Architecture';
/** How many stars the small map shows. */
const MINI_STARS = 70;

const SITE_PAGES: RouteName[] = ['main-page', 'design-system'];

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error('Missing element #' + id);
  return el as T;
}

/** The encyclopedia around the game: routing, the header, the side menu and the two pages. */
export class Site {
  private mini: MiniMap | null = null;
  private readonly body = document.body;

  constructor(
    private readonly provider: DataProvider,
    private readonly play: Play,
  ) {
    this.bind();
    $('topicKey').innerHTML = subjectKeyHtml();
    $('topicDots').innerHTML = subjectDotsHtml();
    // Today's race is the daily pair: the same two articles for every visitor until midnight UTC.
    const today = dailyPair();
    document.querySelectorAll<HTMLElement>('.race a').forEach((a, i) => {
      const title = i === 0 ? today.start : today.target;
      a.textContent = title;
      a.dataset.topic = title;
    });
    // The page stays readable when the data source cannot be reached: no par line, and a note in place of the small map.
    par(provider, today.start, today.target).then(
      (d) => {
        if (d >= 0) $('parText').textContent = 'Par for this pair is ' + d + ' clicks.';
      },
      () => undefined,
    );
    provider.constellation(TODAY).then(
      (data) => {
        this.mini = new MiniMap($<HTMLCanvasElement>('mini'), { center: data.center, stars: data.stars.slice(0, MINI_STARS) });
        this.miniTick();
      },
      () => {
        $('miniNote').hidden = false;
      },
    );
  }

  /** True while the map is the surface on screen. */
  get onMap(): boolean {
    return this.body.dataset.view === 'play';
  }

  /** Show whatever the address bar points at. Call once at startup. */
  start(): void {
    const name = routeOf(location);
    if (location.hash && isRouteName(location.hash.replace('#', ''))) history.replaceState(null, '', pathOf(name));
    this.show(name);
    this.openPlayLink(name);
  }

  /** Act on the query of a /play address: a registered handler first, then the daily race, Connect two, a race pair, and last a shared article. */
  private openPlayLink(name: RouteName): void {
    if (name !== 'play' || dispatchPlayLink(location.search)) return;
    const pair = racePairOf(location.search);
    const article = articleOf(location.search);
    const query = new URLSearchParams(location.search);
    if (query.has('daily')) void this.play.startDaily();
    else if (query.has('connect')) void this.play.startConnect();
    else if (pair) void this.play.startRace(pair.start, pair.target);
    else if (article) void this.play.open(article);
  }

  /** Go to a surface and record it in the address bar. */
  go(name: RouteName): void {
    if (location.pathname !== pathOf(name) || location.search) history.pushState(null, '', pathOf(name));
    this.show(name);
  }

  private show(name: RouteName): void {
    const view = name === 'play' ? 'play' : 'site';
    const was = this.body.dataset.view;
    this.body.dataset.view = view;
    if (view === 'site') {
      for (const p of SITE_PAGES) {
        $('page-' + p).classList.toggle('on', p === name);
        const tab = $('tab-' + p);
        if (p === name) tab.setAttribute('aria-current', 'page');
        else tab.removeAttribute('aria-current');
      }
      window.scrollTo(0, 0);
      this.menu(false);
      this.play.leave();
    } else if (was !== 'play' || !this.play.engine.running) this.play.enter();
    this.miniTick();
  }

  /** Open or close the side menu. It only folds away on narrow screens. */
  private menu(open: boolean): void {
    $('vside').classList.toggle('open', open);
    $('menuBtn').setAttribute('aria-expanded', String(open));
  }

  private miniTick(): void {
    this.mini?.start(() => !this.onMap && $('page-main-page').classList.contains('on'));
  }

  private bind(): void {
    window.addEventListener('popstate', () => {
      const name = routeOf(location);
      this.show(name);
      this.openPlayLink(name);
    });
    window.addEventListener('hashchange', () => {
      const hash = location.hash.replace('#', '');
      if (isRouteName(hash)) {
        history.replaceState(null, '', pathOf(hash));
        this.show(hash);
      }
    });
    document.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-go],[data-race],[data-connect],[data-drift],[data-random],[data-topic],[data-scroll]');
      if (!a) return;
      // A modified click on a real link opens a new tab, as links do.
      if (a.hasAttribute('href') && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)) return;
      const d = a.dataset;
      if (d.scroll) {
        e.preventDefault();
        document.getElementById(d.scroll)?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
        return;
      }
      e.preventDefault();
      if (d.go) {
        if (isRouteName(d.go)) this.go(d.go);
        return;
      }
      this.go('play');
      const topic = d.topic;
      if (d.race) setTimeout(() => void this.play.startDaily(), 30);
      else if (d.drift) setTimeout(() => this.play.startDrift(), 30);
      else if (d.connect) setTimeout(() => void this.play.startConnect(), 30);
      else if (d.random) setTimeout(() => void this.play.surprise(), 30);
      else if (topic) setTimeout(() => void this.play.open(topic), 30);
    });
    $('menuBtn').addEventListener('click', () => this.menu(!$('vside').classList.contains('open')));
    $('vsearch').addEventListener('submit', (e) => {
      e.preventDefault();
      const typed = $<HTMLInputElement>('vq').value.trim();
      this.go('play');
      if (!typed) return;
      void this.provider.suggest(typed).then((found) => {
        const hit = found[0];
        if (hit) void this.play.open(hit.title);
        else {
          this.play.setMode('explore');
          this.play.missing(typed);
        }
      });
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !this.onMap) this.miniTick();
    });
  }
}
