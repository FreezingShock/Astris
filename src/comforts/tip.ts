import { esc } from '../lib';
import { swatch } from '../styles';
import type { PickTarget, Point } from '../engine';
import type { Star } from '../types';

/** "links out · links in · similar name" for one star. */
export function relations(o: Pick<Star, 'linksOut' | 'linksIn' | 'nameMatch'>): string {
  const a: string[] = [];
  if (o.linksOut) a.push('links out');
  if (o.linksIn) a.push('links in');
  if (o.nameMatch) a.push('similar name');
  return a.join(' · ');
}

/** The hover card that follows the pointer over the map. */
export class Tip {
  constructor(
    private readonly el: HTMLElement,
    /** True when the title is the race target, so the card can say so. */
    private readonly isTarget: (title: string) => boolean = () => false,
  ) {}

  show(target: PickTarget | null, p: Point, width: number, height: number): void {
    const el = this.el;
    if (!target) {
      el.style.display = 'none';
      return;
    }
    if (target.kind === 'star') {
      const o = target.node;
      el.innerHTML =
        '<b>' +
        esc(o.title) +
        '</b><span>' +
        swatch(o.subject) +
        ' ' +
        esc(o.subject) +
        ' · rank ' +
        o.rank +
        '<br>' +
        relations(o) +
        (this.isTarget(o.title) ? " · <b style='display:inline;font-size:inherit;font-family:inherit;color:var(--rank-1)'>your target</b>" : '') +
        '</span>';
    } else {
      const c = target.con;
      el.innerHTML = '<b>' + esc(c.title) + '</b><span>' + swatch(c.subject) + ' a constellation you left · click to return</span>';
    }
    el.style.display = 'block';
    el.style.left = Math.min(p.x + 16, width - 290) + 'px';
    el.style.top = Math.min(p.y + 14, height - 90) + 'px';
  }
}
