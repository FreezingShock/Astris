import type { Constellation } from '../types';
import { ease } from '../lib';
import { prefersReducedMotion, token } from '../styles';
import { CONFIG } from './config';
import { drawCon, zoomSize } from './draw';
import { makeCon } from './layout';
import type { Camera, Con, PickTarget, Point, StarNode } from './model';
import { pixelRatio, sprites, type Sprites } from './sprites';
import { World } from './world';

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
 * The map. It takes Constellation data and draws it: layout, bloom, travel and input.
 * Travelling grows the map: the chosen star becomes the centre and its neighbours are added around it,
 * next to everything visited before, instead of replacing it.
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
  /** The time one frame spends drawing, smoothed, in milliseconds. */
  get frameMs(): number {
    return this.cost;
  }

  /** Detail now being drawn, 0 (everything) to lodMax. */
  get detail(): number {
    return this.lod;
  }

  /** True while the frame loop runs. */
  running = false;

  private readonly ctx: CanvasRenderingContext2D;
  private readonly sp: Sprites;
  private readonly reduce = prefersReducedMotion();
  private readonly colors: { white: string; trail: string; title: string; strong: string; soft: string; visited: string };
  private cons: Con[] = [];
  /** A travel that has started and is waiting for its constellation. */
  private pending: { title: string; from: Con; con: Con; wasVisited: boolean } | null = null;
  private readonly world = new World(CONFIG.starGap);
  private readonly cam: Camera = { x: 0, y: 0, z: 1 };
  private readonly tgt: Camera = { x: 0, y: 0, z: 1 };
  private raf = 0;
  private last = 0;
  private enabled = false;
  private hover: StarNode | null = null;
  private ratio = 1;
  private W = 0;
  private H = 0;
  private readonly ptrs = new Map<number, Point>();
  private moved = 0;
  private lastP: Point = { x: 0, y: 0 };
  private pinch = 0;
  /** Drawing detail 0 to lodMax, and the smoothed time one frame spends drawing. */
  private lod = 0;
  private last0 = 0;
  private calm = 0;
  /** Share of the screen's pixel ratio drawn at, lowered when even the lowest detail is too slow. */
  private shrink = 1;
  private cost = 0;
  private hold = 0;
  /** Pan velocity in map units per millisecond, for the glide after a drag. */
  private vel: Point = { x: 0, y: 0 };
  private velAt = 0;
  private moving = 0;

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

  /** Every other constellation on the map, oldest first. */
  get memories(): Con[] {
    return this.cons.filter((c) => c !== this.current && !c.gone);
  }

  /** Stars on the map, counting each article once. */
  get starCount(): number {
    return this.world.size;
  }

  /** Allow the loop to run and fit the view. Called when the map route opens. */
  enable(): void {
    this.enabled = true;
    this.resize();
    if (this.current) {
      this.tgt.z = this.fitZ(this.current);
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
    const d = pixelRatio() * this.shrink;
    this.ratio = d;
    this.W = r.width;
    this.H = r.height;
    this.canvas.width = Math.round(this.W * d);
    this.canvas.height = Math.round(this.H * d);
    this.ctx.setTransform(d, 0, 0, d, 0, 0);
  }

  /** Throw the map away and grow one constellation at the origin. */
  reset(data: Constellation): void {
    const now = performance.now();
    this.world.clear();
    const con = makeCon(data, 0, 0, now, 0);
    this.settle(con);
    this.cons = [con];
    this.current = con;
    this.trail = [con.title];
    this.visited.clear();
    this.tgt.z = this.fitZ(con);
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
   * Its neighbours are added around it and everything already on the map stays.
   * A star that is already on the map is not added again; the new centre only threads to it.
   * Travelling to a centre visited before just moves the view there.
   */
  travel(data: Constellation): void {
    const title = data.center.title;
    const p = this.pending;
    if (p && p.title === title) {
      // the stand-in becomes the real constellation, and its stars bloom in
      const now = performance.now();
      const con = makeCon(data, p.con.x, p.con.y, now, 0);
      con.sc = CONFIG.childScale;
      this.pending = null;
      this.clear(con);
      this.settle(con);
      this.cons[this.cons.indexOf(p.con)] = con;
      this.current = con;
      this.trim(con);
      this.events.onTravel?.(title, now);
      this.events.onChange?.(con);
      this.kick();
      return;
    }
    if (p) this.abort();
    const from = this.current;
    if (!from || title === from.title) return;
    const now = performance.now();
    let con = this.cons.find((c) => c.title === title && !c.gone);
    if (!con) {
      const at = this.world.get(title) ?? { x: from.x, y: from.y };
      con = makeCon(data, at.x, at.y, now, 0);
      con.sc = CONFIG.childScale;
      this.clear(con);
      this.settle(con);
      this.cons.push(con);
    }
    this.arrive(from, con, now);
  }

  /**
   * Start travelling to a star at once, before its constellation has loaded: the star becomes the centre and the
   * camera moves now. When travel() gets the data the stars bloom in; abort() undoes it if loading fails.
   * Returns false when there is nothing to start (the star is not on the map, or it is a centre already visited).
   */
  begin(title: string): boolean {
    if (this.pending) {
      if (this.pending.title === title) return true;
      this.abort();
    }
    const from = this.current;
    if (!from || title === from.title || this.cons.some((c) => c.title === title && !c.gone)) return false;
    const at = this.world.get(title);
    if (!at) return false;
    const subject = this.cons.flatMap((c) => c.nodes).find((n) => n.title === title)?.subject ?? from.subject;
    const now = performance.now();
    const con = makeCon({ center: { title, subject }, stars: [] }, at.x, at.y, now, 0);
    con.sc = CONFIG.childScale;
    con.pending = true;
    this.pending = { title, from, con, wasVisited: this.visited.has(from.title) };
    this.cons.push(con);
    this.arrive(from, con, now, false);
    return true;
  }

  /** Undo a begin() whose constellation did not load. With a title, only if that is the travel waiting. */
  abort(title?: string): void {
    const p = this.pending;
    if (!p || (title !== undefined && p.title !== title)) return;
    this.pending = null;
    this.cons = this.cons.filter((c) => c !== p.con);
    this.current = p.from;
    this.trail.pop();
    if (!p.wasVisited) this.visited.delete(p.from.title);
    this.tgt.z = this.fitZ(p.from);
    this.tgt.x = p.from.x + this.focusOffset();
    this.tgt.y = p.from.y;
    this.kick();
  }

  /** True when a centre visited before can be travelled to without loading anything. */
  revisit(title: string): boolean {
    const from = this.current;
    const con = this.cons.find((c) => c.title === title && !c.gone);
    if (!from || !con || con === from) return false;
    if (this.pending) this.abort();
    this.arrive(this.current ?? from, con, performance.now());
    return true;
  }

  /** The travel waiting for its constellation, if any. */
  get loading(): string | null {
    return this.pending?.title ?? null;
  }

  /** Make a constellation the live one and move the camera to it. */
  private arrive(from: Con, con: Con, now: number, announce = true): void {
    this.visited.add(from.title);
    this.current = con;
    this.trail.push(con.title);
    if (this.trail.length > CONFIG.trailLength) this.trail.shift();
    this.trim(con);
    const fit = this.fitZ(con);
    this.tgt.z = Math.max(fit * CONFIG.keepZoomLow, Math.min(fit * CONFIG.keepZoomHigh, this.tgt.z));
    this.tgt.x = con.x + this.focusOffset();
    this.tgt.y = con.y;
    this.hover = null;
    this.events.onHover?.(null, { x: 0, y: 0 }, this.W, this.H);
    if (announce) {
      this.events.onTravel?.(con.title, now);
      this.events.onChange?.(con);
    }
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
    this.tgt.z = this.fitZ(cur);
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

  private fitZ(con?: Con | null): number {
    const pw = this.W > CONFIG.wideScreen ? CONFIG.panelWidth : 0;
    const fit = Math.min(this.W - pw - CONFIG.fitMarginX, this.H - CONFIG.fitMarginY) / (CONFIG.fitSpan * (con?.sc ?? 1));
    return Math.max(CONFIG.fitMin, Math.min(CONFIG.fitMax, fit));
  }

  /**
   * Make clean room for a new constellation: every star and thread inside the area it will occupy is removed,
   * except the centres already visited and the race target. A star outside the area stays, and the new
   * constellation threads to it when it names the same article.
   */
  private clear(con: Con): void {
    const R = CONFIG.rMax * con.sc * CONFIG.clearShare;
    const keep = new Set<string>(this.cons.map((c) => c.title));
    keep.add(con.title);
    if (this.markerTitle) keep.add(this.markerTitle);
    const gone = new Set<string>();
    for (const c of this.cons) {
      for (const n of c.nodes) {
        if (n.dup || keep.has(n.title)) continue;
        if (Math.hypot(c.x + n.dx * c.sc - con.x, c.y + n.dy * c.sc - con.y) < R) gone.add(n.title);
      }
    }
    if (!gone.size) return;
    for (const c of this.cons) {
      const drop = new Set(c.nodes.filter((n) => gone.has(n.title)));
      if (!drop.size) continue;
      c.nodes = c.nodes.filter((n) => !drop.has(n));
      for (const g of c.groups) g.nodes = g.nodes.filter((n) => !drop.has(n));
      c.groups = c.groups.filter((g) => g.nodes.length > 0);
      c.reach = undefined;
      // a thread that hung from a removed star hangs from the nearest star closer in, or from the centre
      const maxSq = CONFIG.maxThread * CONFIG.maxThread;
      for (const n of c.nodes) {
        if (!n.par || !drop.has(n.par)) continue;
        let best: StarNode | null = null;
        let bd = maxSq;
        for (const p of c.nodes) {
          if (p === n || p.r >= n.r || p.dup) continue;
          const d = (p.dx - n.dx) * (p.dx - n.dx) + (p.dy - n.dy) * (p.dy - n.dy);
          if (d < bd) {
            bd = d;
            best = p;
          }
        }
        n.par = best;
      }
    }
    for (const t of gone) this.world.delete(t);
  }

  /**
   * Fit a new constellation into the map: a star already on the map is not drawn twice, and a new star
   * that would land on an old one is moved outward to the nearest free spot.
   */
  private settle(con: Con): void {
    const w = this.world;
    const from = { x: con.x, y: con.y };
    if (!w.has(con.title)) w.set(con.title, con.x, con.y);
    for (const n of con.nodes) {
      const known = w.get(n.title);
      if (known) {
        n.dup = true;
        n.dx = (known.x - con.x) / con.sc;
        n.dy = (known.y - con.y) / con.sc;
        n.par = null;
        this.shifted(n, Math.hypot(n.dx, n.dy));
        continue;
      }
      const spot = w.free(con.x + n.dx * con.sc, con.y + n.dy * con.sc, from);
      n.dx = (spot.x - con.x) / con.sc;
      n.dy = (spot.y - con.y) / con.sc;
      this.shifted(n, Math.hypot(n.dx, n.dy));
      w.set(n.title, spot.x, spot.y);
    }
  }

  /** A star that moved outward appears later, so that the ring of light still reaches it first. */
  private shifted(n: StarNode, r: number): void {
    n.born += ((r - n.r) / CONFIG.rMax) * CONFIG.bloomSpreadMs;
    n.r = r;
  }

  /** Keep the map inside its star budget by dropping the oldest outer stars, outermost rank first. */
  private trim(keep: Con): void {
    if (this.world.size <= CONFIG.maxWorldStars) return;
    for (const rank of [5, 4, 3]) {
      for (const c of this.cons) {
        if (c === keep || this.world.size <= CONFIG.maxWorldStars) continue;
        const gone = c.nodes.filter((n) => n.rank === rank && !n.dup);
        if (!gone.length) continue;
        for (const n of gone) this.world.delete(n.title);
        const drop = new Set(c.nodes.filter((n) => n.rank === rank));
        c.nodes = c.nodes.filter((n) => !drop.has(n));
        c.reach = undefined;
        for (const g of c.groups) g.nodes = g.nodes.filter((n) => !drop.has(n));
        c.groups = c.groups.filter((g) => g.nodes.length > 0);
      }
    }
  }

  private focusOffset(): number {
    return this.W > CONFIG.wideScreen ? CONFIG.panelOffset / this.tgt.z : 0;
  }

  private readonly frame = (now: number): void => {
    if (!this.running) return;
    const { ctx, cam, tgt, reduce, W, H, sp, colors } = this;
    const cur = this.current;
    const t0 = performance.now();
    const dt = Math.min(CONFIG.maxFrameMs, now - (this.last || now));
    this.last = now;
    this.glide(dt);
    const still = Math.abs(tgt.x - cam.x) + Math.abs(tgt.y - cam.y) < CONFIG.settlePan * 4 && Math.abs(tgt.z - cam.z) < CONFIG.settleZoom * 8;
    const level = still && !this.ptrs.size && this.moving === 0 ? this.lod : Math.max(this.lod, CONFIG.lodMoving);
    const k = reduce ? 1 : 1 - Math.exp(-dt * CONFIG.cameraEase);
    cam.x += (tgt.x - cam.x) * k;
    cam.y += (tgt.y - cam.y) * k;
    cam.z += (tgt.z - cam.z) * k;
    ctx.clearRect(0, 0, W, H);
    const tile = CONFIG.dustTile;
    // snapped to whole screen pixels, so the tile is copied and never resampled
    const px = -Math.round(((cam.x * CONFIG.dustParallax) % tile) * this.ratio) / this.ratio;
    const py = -Math.round(((cam.y * CONFIG.dustParallax) % tile) * this.ratio) / this.ratio;
    for (let gx = px - tile; gx < W; gx += tile) for (let gy = py - tile; gy < H; gy += tile) ctx.drawImage(sp.dust, gx, gy, tile, tile);

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
    for (const c of live) if (c !== cur) total += drawCon(ctx, c, cam, now, W, H, { pulses: 0, centreScale: CONFIG.visitedCentreScale, lod: level }, sp, reduce);

    // the trail you left, from memory to memory to here
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = CONFIG.trailWidth;
    ctx.setLineDash(CONFIG.trailDash);
    const byTitle = new Map(live.map((c) => [c.title, c]));
    for (let i = 1; i < this.trail.length; i++) {
      const A = byTitle.get(this.trail[i - 1] ?? '');
      const B = byTitle.get(this.trail[i] ?? '');
      if (!A || !B || A === B) continue;
      ctx.strokeStyle = 'rgba(' + colors.trail + ',' + Math.min(CONFIG.trailAlphaMax, A.dim * CONFIG.trailAlphaBoost + 0.1) + ')';
      ctx.beginPath();
      ctx.moveTo(A.cx, A.cy);
      ctx.lineTo(B.cx, B.cy);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (cur) total += drawCon(ctx, cur, cam, now, W, H, { pulses: CONFIG.pulses, lod: level }, sp, reduce);

    // marker around one star, used for the race target
    if (this.markerTitle && cur) {
      for (const n of live.flatMap((c) => c.nodes)) {
        if (n.title === this.markerTitle && !n.dup && n.a > CONFIG.pickMinGrow && n.on) {
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
    const titled = cur ? [cur, ...live.filter((c) => c !== cur)] : [];
    for (const c of titled) {
      if (c.vis === false) continue;
      for (let j0 = 0; j0 < c.nodes.length && placed < CONFIG.maxLabels; j0++) {
        const n = c.nodes[j0];
        if (!n || !n.on || n.dup || n.a < CONFIG.labelMinGrow || n === this.hover) continue;
        const big = n.rank <= CONFIG.labelStrongRank;
        if (!big && cam.z * c.sc < CONFIG.labelFarZoom && n.rank > CONFIG.labelFarRank) continue;
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
    this.adapt(this.last0 ? now - this.last0 : 0, performance.now() - t0);
    this.last0 = now;
    const settled = Math.abs(tgt.x - cam.x) + Math.abs(tgt.y - cam.y) < CONFIG.settlePan && Math.abs(tgt.z - cam.z) < CONFIG.settleZoom;
    if (reduce && settled && !this.cons.some((c) => c.gm || Math.abs(c.dim - c.dimT) > CONFIG.settleDim)) {
      this.running = false;
      return;
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  /** Keep a pan gliding after the pointer lets go, slowing smoothly to a stop. */
  private glide(dt: number): void {
    const v = this.vel;
    if (this.reduce || this.ptrs.size || Math.abs(v.x) + Math.abs(v.y) < CONFIG.glideMin) {
      if (!this.ptrs.size || this.reduce) v.x = v.y = 0;
      this.moving = Math.max(0, this.moving - 1);
      return;
    }
    const f = Math.exp(-dt * CONFIG.glideDecay);
    this.tgt.x -= v.x * dt;
    this.tgt.y -= v.y * dt;
    this.cam.x -= v.x * dt;
    this.cam.y -= v.y * dt;
    v.x *= f;
    v.y *= f;
    this.moving = 3;
  }

  /**
   * Adaptive detail: when drawing takes too long, drop the faintest stars and their light, and bring them back
   * when there is time to spare.
   */
  private adapt(gap: number, ms: number): void {
    // the time between frames is what the reader feels; drawing time alone misses the work done after the calls are made
    const felt = Math.max(gap, ms);
    if (gap > 250) this.calm = 0;
    else this.cost = this.cost ? this.cost * 0.9 + felt * 0.1 : felt;
    if (this.hold > 0) this.hold--;
    else if (this.cost > CONFIG.lodSlowMs && this.lod < CONFIG.lodMax) {
      this.lod++;
      this.hold = CONFIG.lodHold;
    } else if (this.cost > CONFIG.lodSlowMs * 1.5 && this.shrink > CONFIG.shrinkMin && pixelRatio() > 1) {
      this.shrink = Math.max(CONFIG.shrinkMin, this.shrink * CONFIG.shrinkStep);
      this.hold = CONFIG.lodHold * 2;
      this.resize();
    } else if (this.cost < CONFIG.lodFastMs && ++this.calm < CONFIG.lodCalm) {
      // wait for a calm stretch before asking for more detail
    } else if (this.cost < CONFIG.lodFastMs && this.shrink < 1) {
      this.shrink = Math.min(1, this.shrink / CONFIG.shrinkStep);
      this.calm = 0;
      this.hold = CONFIG.lodHold * 2;
      this.resize();
    } else if (this.cost < CONFIG.lodFastMs && this.lod > 0) {
      this.lod--;
      this.calm = 0;
      this.hold = CONFIG.lodHold;
    }
    if (this.cost >= CONFIG.lodFastMs) this.calm = 0;
  }

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
    // the live constellation first, so that it wins a tie
    for (const c of [cur, ...this.cons.filter((x) => x !== cur && !x.gone)]) {
      if (c.vis === false) continue;
      for (const n of c.nodes) {
        if (!n.on || n.a < CONFIG.pickMinGrow) continue;
        const d = (n.sx - p.x) * (n.sx - p.x) + (n.sy - p.y) * (n.sy - p.y);
        if (d < bd) {
          bd = d;
          best = n;
        }
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
      this.vel = { x: 0, y: 0 };
      this.velAt = performance.now();
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
      const tNow = performance.now();
      const span = Math.max(1, tNow - this.velAt);
      this.vel = { x: this.vel.x * 0.6 + (dx / span) * 0.4, y: this.vel.y * 0.6 + (dy / span) * 0.4 };
      this.velAt = tNow;
      this.moved += Math.abs(p.x - this.lastP.x) + Math.abs(p.y - this.lastP.y);
      this.lastP = p;
      this.kick();
    });
    const up = (e: PointerEvent): void => {
      const had = this.ptrs.delete(e.pointerId);
      this.pinch = 0;
      sky.classList.remove('drag');
      if (this.moved < CONFIG.clickSlop || performance.now() - this.velAt > 80 || this.ptrs.size > 0) this.vel = { x: 0, y: 0 };
      else this.kick();
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
