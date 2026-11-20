import './comforts.css';
import { esc } from '../lib';
import { swatch } from '../styles';
import type { PickTarget, Point } from '../engine';
import type { ArticleSummary, Star } from '../types';

/** "links out · links in · similar name" for one star. */
export function relations(o: Pick<Star, 'linksOut' | 'linksIn' | 'nameMatch'>): string {
  const a: string[] = [];
  if (o.linksOut) a.push('links out');
  if (o.linksIn) a.push('links in');
  if (o.nameMatch) a.push('similar name');
  return a.join(' · ');
}

/** The strength of a tie in words, from its rank. */
export function tieWord(rank: number): string {
  return rank <= 2 ? 'Close tie' : rank === 3 ? 'Fair tie' : 'Loose tie';
}

/** One plain sentence saying how a star connects to the article at the centre. */
export function tieLine(o: Pick<Star, 'linksOut' | 'linksIn' | 'nameMatch' | 'rank'>, centre: string | null): string {
  const to = centre ? ' ' + centre : ' this article';
  let how: string;
  if (o.linksOut && o.linksIn) how = 'links both ways with' + to;
  else if (o.linksOut) how = 'is linked from' + to;
  else if (o.linksIn) how = 'links to' + to;
  else how = 'has a name like' + to;
  if (o.nameMatch && (o.linksOut || o.linksIn)) how += ', and a similar name';
  return tieWord(o.rank) + ': ' + how;
}

/** Where the preview text comes from. The data provider's summary() fits. */
export type SummarySource = (title: string, signal?: AbortSignal) => Promise<ArticleSummary>;

/** How long the pointer rests on a star before its summary is requested, in ms. */
export const PREVIEW_DELAY = 160;
const FIRST_LINE_MAX = 170;
const CACHE_MAX = 200;

/** The first sentence of an extract, cut at a word and marked with an ellipsis when it runs long. */
export function firstLine(extract: string, max = FIRST_LINE_MAX): string {
  const text = extract.replace(/\s+/g, ' ').trim();
  // A sentence ends at . ! or ? followed by a space and a capital or opening quote, but not after an initial like "J."
  const end = /(?<![A-Z])[.!?]["”’)]?(?=\s+["“‘(]?[A-Z])/.exec(text);
  const line = end ? text.slice(0, end.index + end[0].length) : text;
  if (line.length <= max) return line;
  const cut = line.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:]+$/, '') + '…';
}

/** The preview block: thumbnail, first line and the licence. Empty when there is nothing to say. */
export function previewHtml(summary: ArticleSummary): string {
  const line = firstLine(summary.extract);
  const thumb = summary.thumbnail && /^https:\/\//.test(summary.thumbnail) ? summary.thumbnail : '';
  if (!line && !thumb) return '';
  return (
    "<div class='pv'>" +
    (thumb ? "<img src='" + esc(thumb).replace(/'/g, '&#39;') + "' alt='' width='56' height='56' decoding='async'>" : '') +
    '<p>' +
    esc(line) +
    '</p></div><small>From Wikipedia · CC BY-SA 4.0</small>'
  );
}

/** The hover card that follows the pointer over the map, with a preview of the article under it. */
export class Tip {
  private readonly cache = new Map<string, ArticleSummary | null>();
  private title: string | null = null;
  private head = '';
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending: AbortController | null = null;
  private at: Point = { x: 0, y: 0 };
  private size = { w: 0, h: 0 };

  constructor(
    private readonly el: HTMLElement,
    /** True when the title is the race target, so the card can say so. */
    private readonly isTarget: (title: string) => boolean = () => false,
    /** Summaries for the preview. Without it the card shows only the star's own facts. */
    private readonly summary?: SummarySource,
    /** The article at the centre of the map, so a tie can be put in words. */
    private readonly centre: () => string | null = () => null,
    /** True for articles the reader has already been to. */
    private readonly seen: (title: string) => boolean = () => false,
  ) {}

  show(target: PickTarget | null, p: Point, width: number, height: number): void {
    const el = this.el;
    if (!target) {
      this.cancel();
      this.title = null;
      el.style.display = 'none';
      return;
    }
    this.at = p;
    this.size = { w: width, h: height };
    let title: string;
    if (target.kind === 'star') {
      const o = target.node;
      title = o.title;
      this.head =
        '<b>' +
        esc(o.title) +
        '</b><span>' +
        swatch(o.subject) +
        ' ' +
        esc(o.subject) +
        (this.seen(o.title) ? ' · visited' : '') +
        '<br>' +
        esc(tieLine(o, this.centre())) +
        (this.isTarget(o.title) ? " · <b style='display:inline;font-size:inherit;font-family:inherit;color:var(--rank-1)'>your target</b>" : '') +
        '</span>';
    } else {
      const c = target.con;
      title = c.title;
      this.head = '<b>' + esc(c.title) + '</b><span>' + swatch(c.subject) + ' a constellation you left · click to return</span>';
    }
    if (title !== this.title) {
      this.cancel();
      this.title = title;
      this.render();
      if (this.summary && !this.cache.has(title)) this.timer = setTimeout(() => this.fetch(title), PREVIEW_DELAY);
    }
    el.style.display = 'block';
    this.place();
  }

  private render(): void {
    const s = this.title === null ? undefined : this.cache.get(this.title);
    this.el.innerHTML = this.head + (s ? previewHtml(s) : '');
  }

  /** Keep the card beside the pointer and inside the map, whatever its height. */
  private place(): void {
    const { el, at, size } = this;
    const w = el.offsetWidth || 290;
    const h = el.offsetHeight || 90;
    el.style.left = Math.max(8, Math.min(at.x + 16, size.w - w - 10)) + 'px';
    el.style.top = Math.max(8, Math.min(at.y + 14, size.h - h - 10)) + 'px';
  }

  private fetch(title: string): void {
    const source = this.summary;
    if (!source) return;
    const ctl = new AbortController();
    this.pending = ctl;
    source(title, ctl.signal).then(
      (s) => this.settle(title, s, ctl),
      () => {
        // An aborted request may be asked again; a failed one is not retried this visit.
        if (!ctl.signal.aborted) this.settle(title, null, ctl);
      },
    );
  }

  private settle(title: string, s: ArticleSummary | null, ctl: AbortController): void {
    if (this.pending === ctl) this.pending = null;
    this.cache.set(title, s);
    if (this.cache.size > CACHE_MAX) {
      const oldest = this.cache.keys().next();
      if (!oldest.done) this.cache.delete(oldest.value);
    }
    if (this.title === title && s) {
      this.render();
      this.place();
    }
  }

  private cancel(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.pending?.abort();
    this.pending = null;
  }
}
