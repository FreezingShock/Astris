import type { DataProvider } from '../types';
import { prefersReducedMotion, subjectDotsHtml, subjectKeyHtml } from '../styles';
import { MiniMap } from '../engine';
import { par, type Play } from '../modes';
import { isRouteName, pathOf, racePairOf, routeOf, type RouteName } from './router';

/** The article at the centre of the main page's small map. */
const TODAY = 'Architecture';
/** Today's race, as shown on the main page. */
const RACE: [string, string] = ['Brutalist architecture', 'Jazz'];
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
    void par(provider, RACE[0], RACE[1]).then((d) => {
      if (d >= 0) $('parText').textContent = 'Par for this pair is ' + d + ' clicks.';
    });
    void provider.constellation(TODAY).then((data) => {
      this.mini = new MiniMap($<HTMLCanvasElement>('mini'), { center: data.center, stars: data.stars.slice(0, MINI_STARS) });
      this.miniTick();
    });
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
    const pair = name === 'play' ? racePairOf(location.search) : null;
    if (pair) void this.play.startRace(pair.start, pair.target);
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
      this.play.leave();
    } else if (was !== 'play' || !this.play.engine.running) this.play.enter();
    this.miniTick();
  }

  private miniTick(): void {
    this.mini?.start(() => !this.onMap && $('page-main-page').classList.contains('on'));
  }

  private bind(): void {
    window.addEventListener('popstate', () => this.show(routeOf(location)));
    window.addEventListener('hashchange', () => {
      const hash = location.hash.replace('#', '');
      if (isRouteName(hash)) {
        history.replaceState(null, '', pathOf(hash));
        this.show(hash);
      }
    });
    document.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-go],[data-race],[data-random],[data-topic],[data-scroll]');
      if (!a) return;
      const d = a.dataset;
      if (d.scroll) {
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
      if (d.race) setTimeout(() => void this.play.startRace(RACE[0], RACE[1]), 30);
      else if (d.random) setTimeout(() => void this.play.surprise(), 30);
      else if (topic) setTimeout(() => void this.play.open(topic), 30);
    });
    $('menuBtn').addEventListener('click', () => $('vside').classList.toggle('open'));
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
