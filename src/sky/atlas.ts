import './atlas.css';
import { esc } from '../lib';
import { SUBJECTS, subjectRgb, swatch, token } from '../styles';
import { Collection, SEEDS, TIERS, place, tierFor } from './collection';

export interface AtlasOptions {
  collection: Collection;
  /** Open an article on the map. */
  open(title: string): void;
  /** Called after the atlas opens or closes. */
  onToggle?(open: boolean): void;
}

function reduced(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** The sky atlas: every collected star on a chart of twelve regions, with the regions and achievements beside it. */
export class Atlas {
  private readonly root: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly body: HTMLElement;
  private readonly tip: HTMLElement;
  private readonly closeBtn: HTMLButtonElement;
  private raf = 0;
  private hover: string | null = null;
  private dots: { x: number; y: number; title: string }[] = [];
  private returnTo: HTMLElement | null = null;

  constructor(private readonly o: AtlasOptions) {
    const root = document.getElementById('atlas');
    if (!root) throw new Error('Missing element #atlas');
    this.root = root;
    root.innerHTML =
      "<div class='at-head'><h2 id='atTitle'>Your sky</h2><button type='button' class='gbtn' id='atClose'>Close</button></div>" +
      "<div class='at-main'><div class='at-chart'><canvas id='atCanvas' aria-label='Your sky: a chart of every article you have visited, in twelve regions'></canvas><div class='at-tip' id='atTip'></div></div>" +
      "<div class='at-side' id='atBody'></div></div>";
    this.canvas = root.querySelector<HTMLCanvasElement>('#atCanvas') as HTMLCanvasElement;
    this.body = root.querySelector<HTMLElement>('#atBody') as HTMLElement;
    this.tip = root.querySelector<HTMLElement>('#atTip') as HTMLElement;
    this.closeBtn = root.querySelector<HTMLButtonElement>('#atClose') as HTMLButtonElement;
    this.closeBtn.addEventListener('click', () => this.close());
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.close();
      }
    });
    root.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-open]');
      if (b?.dataset.open) {
        this.close(false);
        o.open(b.dataset.open);
      }
    });
    this.canvas.addEventListener('pointermove', (e) => this.point(e, false));
    this.canvas.addEventListener('pointerleave', () => this.setHover(null, 0, 0));
    this.canvas.addEventListener('click', (e) => this.point(e, true));
    window.addEventListener('resize', () => this.isOpen && this.draw(performance.now()));
    root.hidden = true;
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(): void {
    if (this.isOpen) return;
    this.returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.root.hidden = false;
    this.refresh();
    this.closeBtn.focus();
    this.o.onToggle?.(true);
  }

  close(restore = true): void {
    if (!this.isOpen) return;
    this.root.hidden = true;
    cancelAnimationFrame(this.raf);
    if (restore) this.returnTo?.focus();
    this.o.onToggle?.(false);
  }

  /** Redraw the lists and the chart. Cheap enough to call on every new star while open. */
  refresh(): void {
    if (!this.isOpen) return;
    this.renderBody();
    cancelAnimationFrame(this.raf);
    const frame = (now: number): void => {
      this.draw(now);
      if (this.isOpen && !reduced()) this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  private renderBody(): void {
    const c = this.o.collection;
    const regions = SUBJECTS.map((s) => {
      const n = c.countIn(s);
      const t = tierFor(n);
      const next = TIERS[t];
      const label = t === 0 ? 'Unlit' : (TIERS[t - 1]?.name ?? '');
      const seed = SEEDS[s];
      const goal =
        t === 0 && seed
          ? "<button type='button' class='at-link' data-open='" + esc(seed).replace(/'/g, '&#39;') + "'>Light it with " + esc(seed) + '</button>'
          : next
            ? n + ' of ' + next.min + ' for ' + next.name
            : 'Fully explored';
      const pct = Math.min(100, Math.round((n / (TIERS[TIERS.length - 1]?.min ?? 1)) * 100));
      return (
        "<li class='at-r" +
        (t === 0 ? ' dark' : '') +
        "'><div class='at-rh'>" +
        swatch(s, 10) +
        '<b>' +
        esc(s) +
        '</b><span>' +
        esc(label) +
        ' · ' +
        n +
        '</span></div>' +
        "<div class='at-bar'><i style='--c:rgb(" +
        subjectRgb(s) +
        ');width:' +
        pct +
        "%'></i></div><small>" +
        goal +
        '</small></li>'
      );
    }).join('');
    const ach = c
      .status()
      .map((a) => {
        const done = a.at !== null;
        return (
          "<li class='at-a" +
          (done ? ' done' : '') +
          "'><b>" +
          esc(a.name) +
          '</b><span>' +
          esc(a.text) +
          '</span><small>' +
          (done ? 'Earned' : a.have + ' of ' + a.need) +
          '</small></li>'
        );
      })
      .join('');
    const done = c.status().filter((a) => a.at !== null).length;
    this.body.innerHTML =
      "<p class='at-sum'><b>" +
      c.count.toLocaleString('en-US') +
      (c.count === 1 ? ' star' : ' stars') +
      '</b> collected · ' +
      c.regionsLit +
      ' of ' +
      SUBJECTS.length +
      ' regions lit · ' +
      done +
      ' of ' +
      c.status().length +
      ' achievements</p>' +
      (c.count === 0 ? "<p class='at-empty'>Nothing here yet. Travel to a star on the map and it joins your sky.</p>" : '') +
      '<h3>Regions</h3><ul class="at-regions">' +
      regions +
      '</ul><h3>Achievements</h3><ul class="at-ach">' +
      ach +
      '</ul>';
  }

  private geometry(): { w: number; h: number; cx: number; cy: number; r: number } {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const side = w < 460 ? 88 : 140;
    return { w, h, cx: w / 2, cy: h / 2, r: Math.max(40, Math.min(w / 2 - side, h / 2 - 26)) };
  }

  private draw(now: number): void {
    const { w, h, cx, cy, r } = this.geometry();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const c = this.o.collection;
    const still = reduced();
    const wedge = (Math.PI * 2) / SUBJECTS.length;
    const ink = token('--starlight-rgb');
    ctx.lineWidth = 1;
    ctx.font = '11px ' + token('--mono');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    SUBJECTS.forEach((s, i) => {
      const a0 = -Math.PI / 2 + i * wedge;
      const t = c.tierOf(s);
      const rgb = subjectRgb(s);
      if (t > 0) {
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, 'rgba(' + rgb + ',0)');
        g.addColorStop(1, 'rgba(' + rgb + ',' + (0.08 + t * 0.07).toFixed(2) + ')');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, a0, a0 + wedge);
        ctx.closePath();
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(' + ink + ',' + (t > 0 ? 0.16 : 0.08) + ')';
      ctx.setLineDash(t > 0 ? [] : [3, 5]);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r);
      ctx.stroke();
      ctx.setLineDash([]);
      const am = a0 + wedge / 2;
      ctx.fillStyle = t > 0 ? 'rgb(' + rgb + ')' : 'rgba(' + ink + ',0.4)';
      const label = w < 460 ? (s === 'Video game' ? 'Games' : (s.split(' ')[0] ?? s)) : s;
      const cos = Math.cos(a0 + wedge / 2);
      ctx.textAlign = cos > 0.1 ? 'left' : cos < -0.1 ? 'right' : 'center';
      ctx.fillText(label, cx + Math.cos(am) * (r + 12), cy + Math.sin(am) * (r + 14));
    });
    ctx.strokeStyle = 'rgba(' + ink + ',0.12)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.14, 0, Math.PI * 2);
    ctx.stroke();
    this.dots = [];
    const newest = c.stars[c.stars.length - 1]?.title;
    for (const s of c.stars) {
      const p = place(s.title, s.subject);
      const x = cx + p.x * r;
      const y = cy + p.y * r;
      this.dots.push({ x, y, title: s.title });
      const rgb = subjectRgb(s.subject);
      const k = still ? 1 : 1 + Math.sin(now / 700 + (p.x + p.y) * 40) * 0.18;
      const size = (s.title === this.hover ? 3.6 : 2.2) * k;
      ctx.fillStyle = 'rgba(' + rgb + ',0.22)';
      ctx.beginPath();
      ctx.arc(x, y, size * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgb(' + rgb + ')';
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
      if (s.title === newest) {
        ctx.strokeStyle = 'rgba(' + ink + ',0.7)';
        ctx.beginPath();
        ctx.arc(x, y, size + 5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  private point(e: PointerEvent | MouseEvent, click: boolean): void {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let best: { x: number; y: number; title: string } | null = null;
    let bd = 14 * 14;
    for (const d of this.dots) {
      const dd = (d.x - x) ** 2 + (d.y - y) ** 2;
      if (dd < bd) {
        bd = dd;
        best = d;
      }
    }
    if (click) {
      if (best) {
        this.close(false);
        this.o.open(best.title);
      }
      return;
    }
    this.setHover(best?.title ?? null, x, y);
  }

  private setHover(title: string | null, x: number, y: number): void {
    this.hover = title;
    this.canvas.style.cursor = title ? 'pointer' : 'default';
    this.tip.style.display = title ? 'block' : 'none';
    if (title) {
      this.tip.textContent = title;
      this.tip.style.left = Math.min(x + 12, this.canvas.clientWidth - 150) + 'px';
      this.tip.style.top = y + 12 + 'px';
    }
    if (reduced() && this.isOpen) this.draw(0);
  }
}
