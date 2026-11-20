import type { Constellation } from '../types';
import { ease, hash } from '../lib';
import { prefersReducedMotion, token } from '../styles';
import { CONFIG } from './config';
import { drawCon, zoomSize } from './draw';
import { makeCon } from './layout';
import type { Camera, Con, PickTarget, Point, StarNode } from './model';
import { sprites, type Sprites } from './sprites';

const TAU = Math.PI * 2;

/** How far the view must move, in screen pixels, for a point to sit at least `margin` inside it. */
export function nudgeIntoView(p: Point, width: number, height: number, margin: number): Point {
  const along = (v: number, size: number): number => (v < margin ? v - margin : v > size - margin ? v - (size - margin) : 0);
  return { x: along(p.x, width), y: along(p.y, height) };
}

export interface FrameStats {
  /** Stars drawn this frame, across the live constellation and its memories. */
  stars: number;
  /** Memories on screen. */
  memories: number;
}

export interface EngineEvents {
  /** The reader clicked a star or a memory. The owner fetches its constellation and calls travel(). */
  onPick?(title: string): void;
  /** The pointer moved over a star, a memory, or nothing. */
  onHover?(target: PickTarget | null, at: Point, width: number, height: number): void;
  /** The live constellation changed, by reset() or travel(). */
  onChange?(current: Con): void;
  /** A travel finished starting; the title is the new centre. */
  onTravel?(title: string, now: number): void;
  /** Once per drawn frame. */
  onFrame?(stats: FrameStats, now: number): void;
}

/**
 * The map. It takes Constellation data and draws it: layout, bloom, travel, memories and input.
 * It never fetches anything itself.
 */
export class Engine {
  /** The live constellation, or null before the first reset(). */
  current: Con | null = null;
  /** Titles of centres already left. */
  readonly visited = new Set<string>();
  /** Centres in the order visited, newest last. */
  trail: string[] = [];
  /** A star to ring with a dashed marker, used by Race for its target. */
  markerTitle: string | null = null;
  /** True while the frame loop runs. */
  running = false;

  private readonly ctx: CanvasRenderingContext2D;
  private readonly sp: Sprites;
  private readonly reduce = prefersReducedMotion();
  private readonly colors: { white: string; trail: string; title: string; strong: string; soft: string; visited: string };
  private cons: Con[] = [];
  private readonly cam: Camera = { x: 0, y: 0, z: 1 };
  private readonly tgt: Camera = { x: 0, y: 0, z: 1 };
  private raf = 0;
  private last = 0;
  private enabled = false;
  private hover: StarNode | null = null;
  private W = 0;
  private H = 0;
  private readonly ptrs = new Map<number, Point>();
  private moved = 0;
  private lastP: Point = { x: 0, y: 0 };
  private pinch = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly events: EngineEvents = {},
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
    this.sp = sprites();
    this.colors = {
      white: token('--white-rgb'),
      trail: token('--trail-rgb'),
      title: token('--title-current'),
      strong: token('--label-strong'),
      soft: token('--label-soft'),
      visited: token('--label-visited'),
    };
    this.bindPointer();
  }

  /** Memories still on the map, oldest first. */
  get memories(): Con[] {
    return this.cons.filter((c) => c !== this.current && !c.gone);
  }

  /** Allow the loop to run and fit the view. Called when the map route opens. */
  enable(): void {
    this.enabled = true;
    this.resize();
    if (this.current) {
      this.tgt.z = this.fitZ();
      this.kick();
    }
  }

  /** Stop the loop. Called when the map route closes or the tab is hidden. */
  disable(): void {
    this.enabled = false;
    this.stop();
  }

  /** Pause the loop without leaving the route. */
  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** Start the loop if the map is showing and the loop is not already running. */
  kick(): void {
    if (!this.enabled || this.running) return;
    this.running = true;
    this.last = 0;
    this.raf = requestAnimationFrame(this.frame);
  }

  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    const d = Math.min(CONFIG.maxPixelRatio, window.devicePixelRatio || 1);
    this.W = r.width;
    this.H = r.height;
    this.canvas.width = Math.round(this.W * d);
    this.canvas.height = Math.round(this.H * d);
    this.ctx.setTransform(d, 0, 0, d, 0, 0);
  }

  /** Throw the map away and grow one constellation at the origin. */
  reset(data: Constellation): void {
    const now = performance.now();
    const con = makeCon(data, 0, 0, now, 0);
    this.cons = [con];
    this.current = con;
    this.trail = [con.title];
    this.visited.clear();
    this.tgt.z = this.fitZ();
    this.tgt.x = this.focusOffset();
    this.tgt.y = 0;
    this.cam.x = this.tgt.x;
    this.cam.y = this.tgt.y;
    this.cam.z = this.tgt.z * CONFIG.resetZoom;
    this.events.onChange?.(con);
    this.kick();
  }

  /**
   * Travel: the chosen star stays exactly where it is and becomes the new centre.
   * Everything else dissolves outward from it. The old constellation shrinks,
   * slides out of the way and stays behind as a faint memory.
   */
  travel(data: Constellation): void {
    const from = this.current;
    const title = data.center.title;
    if (!from || title === from.title) return;
    const now = performance.now();
    const star = from.nodes.find((n) => n.title === title);
    const memory = this.memories.find((c) => c.title === title);
    let wx = from.x;
    let wy = from.y;
    if (star) {
      wx = from.x + star.dx * from.sc;
      wy = from.y + star.dy * from.sc;
    } else if (memory) {
      wx = memory.x;
      wy = memory.y;
    }
    this.visited.add(from.title);
    for (const c of this.cons) {
      if (c.gone) continue;
      if (c.title === title) {
        c.dimT = 0;
        c.gone = true;
        continue;
      }
      const dx = c.x - wx;
      const dy = c.y - wy;
      const d = Math.hypot(dx, dy);
      const a = d < 1 ? (hash(c.title + title) % 628) / 100 : Math.atan2(dy, dx);
      const far = Math.max(d, CONFIG.memoryDistance);
      c.gm = { t0: now, x0: c.x, y0: c.y, x1: wx + Math.cos(a) * far, y1: wy + Math.sin(a) * far, s0: c.sc, s1: c === from ? CONFIG.memoryScale : c.sc * CONFIG.olderMemoryScale };
      if (!c.ghost) {
        c.ghost = { t0: now, via: c === from ? (star ?? null) : null };
        c.dimT = CONFIG.memoryDim;
        c.pulses = [];
        for (const n of c.nodes) {
          const nx = c.x + n.dx * c.sc - wx;
          const ny = c.y + n.dy * c.sc - wy;
          const nd = Math.hypot(nx, ny) || 1;
          n.gd = Math.min(1, nd / CONFIG.dissolveReach) * CONFIG.dissolveSpreadMs;
          n.gux = nx / nd;
          n.guy = ny / nd;
        }
      } else c.dimT *= CONFIG.olderMemoryDim;
    }
    const ghosts = this.cons.filter((c) => c.ghost && !c.gone);
    while (ghosts.length > CONFIG.maxMemories) {
      const old = ghosts.shift();
      if (old) {
        old.dimT = 0;
        old.gone = true;
      }
    }
    const con = makeCon(data, wx, wy, now, 0);
    this.cons.push(con);
    this.current = con;
    this.trail.push(title);
    if (this.trail.length > CONFIG.trailLength) this.trail.shift();
    this.tgt.z = this.fitZ();
    this.tgt.x = wx + this.focusOffset();
    this.tgt.y = wy;
    this.hover = null;
    this.events.onHover?.(null, { x: 0, y: 0 }, this.W, this.H);
    this.events.onTravel?.(title, now);
    this.events.onChange?.(con);
    this.kick();
  }

  /** Zoom about the middle of the view. */
  zoomBy(factor: number): void {
    this.zoomAt({ x: this.W / 2, y: this.H / 2 }, factor);
  }

  /** Centre the live constellation and fit it to the view. */
  fit(): void {
    const cur = this.current;
    if (!cur) return;
    this.tgt.z = this.fitZ();
    this.tgt.x = cur.x + this.focusOffset();
    this.tgt.y = cur.y;
    this.kick();
  }

  /**
   * Ring a star of the live constellation as if the pointer were over it, for keyboard travel.
   * Null clears the ring. Returns true when a star was ringed.
   * A star near the edge of the view is brought inside it.
   */
  highlight(title: string | null): boolean {
    const node = title === null ? undefined : this.current?.nodes.find((n) => n.title === title && n.on && n.a >= CONFIG.pickMinGrow);
    if (!node) {
      this.hover = null;
      this.events.onHover?.(null, { x: 0, y: 0 }, this.W, this.H);
      this.kick();
      return false;
    }
    this.hover = node;
    const shift = nudgeIntoView({ x: node.sx, y: node.sy }, this.W, this.H, CONFIG.highlightMargin);
    this.tgt.x += shift.x / this.cam.z;
    this.tgt.y += shift.y / this.cam.z;
    this.events.onHover?.({ kind: 'star', node }, { x: node.sx, y: node.sy }, this.W, this.H);
    this.kick();
    return true;
  }

  /** Forget measured label widths, for when a web font finishes loading. */
  clearLabelCache(): void {
    if (!this.current) return;
    for (const n of this.current.nodes) n.wb = n.ws = undefined;
  }

  private fitZ(): number {
    const pw = this.W > CONFIG.wideScreen ? CONFIG.panelWidth : 0;
    return Math.max(CONFIG.fitMin, Math.min(CONFIG.fitMax, Math.min(this.W - pw - CONFIG.fitMarginX, this.H - CONFIG.fitMarginY) / CONFIG.fitSpan));
  }

  private focusOffset(): number {
    return this.W > CONFIG.wideScreen ? CONFIG.panelOffset / this.tgt.z : 0;
  }

  private readonly frame = (now: number): void => {
    if (!this.running) return;
    const { ctx, cam, tgt, reduce, W, H, sp, colors } = this;
    const cur = this.current;
    const dt = Math.min(CONFIG.maxFrameMs, now - (this.last || now));
    this.last = now;
    const k = reduce ? 1 : 1 - Math.exp(-dt * CONFIG.cameraEase);
    cam.x += (tgt.x - cam.x) * k;
    cam.y += (tgt.y - cam.y) * k;
    cam.z += (tgt.z - cam.z) * k;
    ctx.clearRect(0, 0, W, H);
    const tile = CONFIG.dustTile;
    const px = -((cam.x * CONFIG.dustParallax) % tile);
    const py = -((cam.y * CONFIG.dustParallax) % tile);
    ctx.globalAlpha = CONFIG.dustAlpha;
    for (let gx = px - tile; gx < W; gx += tile) for (let gy = py - tile; gy < H; gy += tile) ctx.drawImage(sp.dust, gx, gy);
    ctx.globalAlpha = 1;

    // memories slide away and shrink
    for (const c of this.cons) {
      c.dim += (c.dimT - c.dim) * k;
      if (c.gm) {
        const p = reduce ? 1 : ease((now - c.gm.t0) / CONFIG.memoryMoveMs);
        const e = p * p * (3 - 2 * p);
        c.x = c.gm.x0 + (c.gm.x1 - c.gm.x0) * e;
        c.y = c.gm.y0 + (c.gm.y1 - c.gm.y0) * e;
        c.sc = c.gm.s0 + (c.gm.s1 - c.gm.s0) * e;
        if (p >= 1) c.gm = null;
      }
    }
    this.cons = this.cons.filter((c) => !(c.gone && c.dim < CONFIG.goneCutoff));
    let total = 0;
    const live = this.cons.filter((c) => !c.gone);
    for (const c of live) if (c !== cur) total += drawCon(ctx, c, cam, now, W, H, { pulses: 0 }, sp, reduce);

    // the trail you left, from memory to memory to here
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = CONFIG.trailWidth;
    ctx.setLineDash(CONFIG.trailDash);
    for (let i = 1; i < live.length; i++) {
      const A = live[i - 1];
      const B = live[i];
      if (!A || !B) continue;
      ctx.strokeStyle = 'rgba(' + colors.trail + ',' + Math.min(CONFIG.trailAlphaMax, A.dim + CONFIG.trailAlphaBoost) + ')';
      ctx.beginPath();
      ctx.moveTo(A.cx, A.cy);
      ctx.lineTo(W / 2 + (B.x - cam.x) * cam.z, H / 2 + (B.y - cam.y) * cam.z);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (cur) total += drawCon(ctx, cur, cam, now, W, H, { pulses: CONFIG.pulses }, sp, reduce);

    // marker around one star, used for the race target
    if (this.markerTitle && cur) {
      for (const n of cur.nodes) {
        if (n.title === this.markerTitle && n.a > CONFIG.pickMinGrow && n.on) {
          const rr = CONFIG.markerRadius + (reduce ? 0 : Math.sin(now * CONFIG.markerPulseSpeed) * CONFIG.markerPulse);
          ctx.strokeStyle = 'rgb(' + colors.white + ')';
          ctx.lineWidth = CONFIG.markerWidth;
          ctx.setLineDash(CONFIG.markerDash);
          ctx.beginPath();
          ctx.arc(n.sx, n.sy, rr, 0, TAU);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.lineWidth = 1;
        }
      }
    }

    // titles
    const boxes: [number, number, number, number][] = [];
    const gap = CONFIG.labelSpacing;
    let placed = 0;
    ctx.textAlign = 'center';
    for (const c of live) {
      const on = c === cur;
      const zz = zoomSize(cam.z * c.sc);
      ctx.font = on ? CONFIG.fontCentre : CONFIG.fontMemory;
      ctx.fillStyle = on ? colors.title : 'rgba(' + colors.trail + ',' + Math.min(CONFIG.memoryTitleAlphaMax, c.dim + CONFIG.memoryTitleAlphaBoost) + ')';
      if (on) ctx.globalAlpha = reduce ? 1 : ease((now - c.born) / CONFIG.titleFadeMs);
      const y = c.cy + (on ? CONFIG.titleOffset : CONFIG.memoryTitleOffset) * zz;
      ctx.fillText(c.title, c.cx, y);
      ctx.globalAlpha = 1;
      const tw = ctx.measureText(c.title).width;
      boxes.push([c.cx - tw / 2 - CONFIG.titleBoxPad, y - CONFIG.titleBoxRise, tw + CONFIG.titleBoxPad * 2, CONFIG.titleBoxHeight]);
    }
    ctx.textAlign = 'left';
    if (cur) {
      for (let j0 = 0; j0 < cur.nodes.length && placed < CONFIG.maxLabels; j0++) {
        const n = cur.nodes[j0];
        if (!n || !n.on || n.a < CONFIG.labelMinGrow || n === this.hover) continue;
        const big = n.rank <= CONFIG.labelStrongRank;
        if (!big && cam.z < CONFIG.labelFarZoom && n.rank > CONFIG.labelFarRank) continue;
        ctx.font = big ? CONFIG.fontStrong : CONFIG.fontSoft;
        let bw = big ? n.wb : n.ws;
        if (bw === undefined) {
          bw = ctx.measureText(n.title).width;
          if (big) n.wb = bw;
          else n.ws = bw;
        }
        const bx = n.sx + (CONFIG.size[n.rank] ?? 0) * CONFIG.labelOffset + CONFIG.labelGap;
        const by = n.sy - CONFIG.labelRise;
        if (bx + bw > W - CONFIG.labelEdge) continue;
        let hit = false;
        for (const b of boxes) {
          if (!(bx > b[0] + b[2] + gap || bx + bw + gap < b[0] || by > b[1] + b[3] || by + CONFIG.labelHeight < b[1])) {
            hit = true;
            break;
          }
        }
        if (hit) continue;
        boxes.push([bx, by, bw, CONFIG.labelHeight]);
        placed++;
        ctx.fillStyle = this.visited.has(n.title) ? colors.visited : big ? colors.strong : colors.soft;
        ctx.fillText(n.title, bx, n.sy + CONFIG.labelBaseline);
      }
    }
    const hover = this.hover;
    if (hover && hover.on) {
      ctx.strokeStyle = 'rgba(' + colors.white + ',' + CONFIG.hoverRingAlpha + ')';
      ctx.beginPath();
      ctx.arc(hover.sx, hover.sy, (CONFIG.size[hover.rank] ?? 0) + CONFIG.hoverRingGap, 0, TAU);
      ctx.stroke();
    }
    this.events.onFrame?.({ stars: total, memories: live.length - 1 }, now);
    const settled = Math.abs(tgt.x - cam.x) + Math.abs(tgt.y - cam.y) < CONFIG.settlePan && Math.abs(tgt.z - cam.z) < CONFIG.settleZoom;
    if (reduce && settled && !this.cons.some((c) => c.gm || Math.abs(c.dim - c.dimT) > CONFIG.settleDim)) {
      this.running = false;
      return;
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  /* ---------- pointer ---------- */

  private at(e: MouseEvent): Point {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private pick(p: Point): PickTarget | null {
    const cur = this.current;
    if (!cur) return null;
    let best: StarNode | null = null;
    let bd = CONFIG.pickRadius * CONFIG.pickRadius;
    for (const n of cur.nodes) {
      if (!n.on || n.a < CONFIG.pickMinGrow) continue;
      const d = (n.sx - p.x) * (n.sx - p.x) + (n.sy - p.y) * (n.sy - p.y);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    if (best) return { kind: 'star', node: best };
    let memory: Con | null = null;
    for (const c of this.cons) if (c !== cur && !c.gone && Math.hypot(c.cx - p.x, c.cy - p.y) < CONFIG.memoryPickRadius) memory = c;
    return memory ? { kind: 'memory', con: memory } : null;
  }

  private zoomAt(p: Point, f: number): void {
    const { cam, tgt, W, H } = this;
    const nz = Math.max(CONFIG.zoomMin, Math.min(CONFIG.zoomMax, tgt.z * f));
    const wx = cam.x + (p.x - W / 2) / cam.z;
    const wy = cam.y + (p.y - H / 2) / cam.z;
    tgt.x = wx - (p.x - W / 2) / nz;
    tgt.y = wy - (p.y - H / 2) / nz;
    tgt.z = nz;
    this.kick();
  }

  private bindPointer(): void {
    const sky = this.canvas;
    sky.addEventListener('pointerdown', (e) => {
      sky.setPointerCapture(e.pointerId);
      const p = this.at(e);
      this.ptrs.set(e.pointerId, p);
      this.moved = 0;
      this.lastP = p;
      this.pinch = 0;
      sky.classList.add('drag');
    });
    sky.addEventListener('pointermove', (e) => {
      const p = this.at(e);
      if (!this.ptrs.has(e.pointerId)) {
        const o = this.pick(p);
        const over = o && o.kind === 'star' ? o.node : null;
        sky.style.cursor = o ? 'pointer' : '';
        // with reduced motion the loop rests, so a change of ring needs a frame
        if (over !== this.hover) this.kick();
        this.hover = over;
        this.events.onHover?.(o, p, this.W, this.H);
        return;
      }
      this.ptrs.set(e.pointerId, p);
      if (this.ptrs.size === 2) {
        const [A, B] = [...this.ptrs.values()];
        if (A && B) {
          const dd = Math.hypot(A.x - B.x, A.y - B.y);
          if (this.pinch) this.zoomAt({ x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 }, dd / this.pinch);
          this.pinch = dd;
          this.moved = CONFIG.clickSlop;
        }
        return;
      }
      const dx = (p.x - this.lastP.x) / this.cam.z;
      const dy = (p.y - this.lastP.y) / this.cam.z;
      this.tgt.x -= dx;
      this.tgt.y -= dy;
      this.cam.x -= dx;
      this.cam.y -= dy;
      this.moved += Math.abs(p.x - this.lastP.x) + Math.abs(p.y - this.lastP.y);
      this.lastP = p;
      this.kick();
    });
    const up = (e: PointerEvent): void => {
      const had = this.ptrs.delete(e.pointerId);
      this.pinch = 0;
      sky.classList.remove('drag');
      if (had && this.moved < CONFIG.clickSlop && e.type === 'pointerup') {
        const o = this.pick(this.at(e));
        if (o) this.events.onPick?.(o.kind === 'star' ? o.node.title : o.con.title);
      }
      const first = this.ptrs.values().next();
      if (!first.done) this.lastP = first.value;
    };
    sky.addEventListener('pointerup', up);
    sky.addEventListener('pointercancel', up);
    sky.addEventListener('pointerleave', () => {
      if (this.hover) this.kick();
      this.hover = null;
      this.events.onHover?.(null, { x: 0, y: 0 }, this.W, this.H);
    });
    sky.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.zoomAt(this.at(e), Math.exp(-e.deltaY * CONFIG.wheelSpeed));
      },
      { passive: false },
    );
  }
}
