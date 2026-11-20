import { ease, spring } from '../lib';
import { subjectRgb } from '../styles';
import { CONFIG } from './config';
import type { Camera, Con } from './model';
import type { Sprites } from './sprites';

export interface DrawOptions {
  /** How many points of light run along the threads. */
  pulses: number;
  /** The small constellation on the main page draws a smaller centre star. */
  mini?: boolean;
  /** Share of the full centre-star size, for the centres of constellations already visited. */
  centreScale?: number;
  /** Detail level 0 (everything) to 3 (fewest stars). */
  lod?: number;
}

const TAU = Math.PI * 2;

/** How much stars and titles grow with the zoom: its square root, clamped. */
export function zoomSize(scale: number): number {
  return Math.max(CONFIG.zoomSizeMin, Math.min(CONFIG.zoomSizeMax, Math.sqrt(scale)));
}

/** How far along its thread a star has flown, 0 to 1, easing out: it leaves its parent and lands at `born`. */
export function flight(born: number, now: number, reduce: boolean): number {
  return reduce ? 1 : ease((now - (born - CONFIG.flyMs)) / CONFIG.flyMs);
}

/** The thread's curve grown to p of its length: its control point and its tip, where the star rides. */
function bez(ax: number, ay: number, bx: number, by: number, bend: number, p: number): { qx: number; qy: number; ex: number; ey: number } {
  const mx = (ax + bx) / 2 - (by - ay) * bend;
  const my = (ay + by) / 2 + (bx - ax) * bend;
  const qx = ax + (mx - ax) * p;
  const qy = ay + (my - ay) * p;
  return { qx, qy, ex: qx + (mx + (bx - mx) * p - qx) * p, ey: qy + (my + (by - my) * p - qy) * p };
}

/** Stroke the threads of a constellation, batched by subject and rank. `fade` is set while it dissolves into a memory. */
function strokeThreads(
  ctx: CanvasRenderingContext2D,
  con: Con,
  cx: number,
  cy: number,
  S: number,
  now: number,
  reduce: boolean,
  w: number,
  h: number,
  via: Con['nodes'][number] | null,
  fade: number | null,
): void {
  for (const G of con.groups) {
    const ta = (CONFIG.threadAlpha[G.rank] ?? 0) * (fade !== null ? (G.rank <= CONFIG.memoryKeepRank ? con.dim : fade) : con.dim);
    if (ta < CONFIG.threadCutoff) continue;
    if (G.rank > CONFIG.dupThreadMaxRank && S < CONFIG.lodThreadZoom) continue;
    ctx.strokeStyle = 'rgba(' + subjectRgb(G.subject) + ',' + ta + ')';
    ctx.beginPath();
    for (const o of G.nodes) {
      const p = flight(o.born, now, reduce);
      if (p <= 0 || o.out?.hard || (via && (o === via || o.par === via)) || (o.dup && o.rank > CONFIG.dupThreadMaxRank)) continue;
      const ax = o.par ? cx + o.par.dx * S : cx;
      const ay = o.par ? cy + o.par.dy * S : cy;
      const bx = cx + o.dx * S;
      const by = cy + o.dy * S;
      if ((ax < 0 && bx < 0) || (ax > w && bx > w) || (ay < 0 && by < 0) || (ay > h && by > h)) continue;
      const t = bez(ax, ay, bx, by, o.bend, p);
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo(t.qx, t.qy, t.ex, t.ey);
    }
    ctx.stroke();
  }
}

/** How far the farthest star is from the centre, in unscaled units. Cleared when stars are dropped. */
export function reachOf(con: Con): number {
  if (con.reach === undefined) con.reach = con.nodes.reduce((m, n) => Math.max(m, Math.hypot(n.dx, n.dy)), 0) + 8;
  return con.reach;
}

/** Draw one constellation into any 2D context. Returns the number of stars drawn. */
export function drawCon(ctx: CanvasRenderingContext2D, con: Con, cam: Camera, now: number, w: number, h: number, opt: DrawOptions, sp: Sprites, reduce: boolean): number {
  const z = cam.z;
  const S = z * con.sc;
  const cx = w / 2 + (con.x - cam.x) * z;
  const cy = h / 2 + (con.y - cam.y) * z;
  const g = con.ghost;
  const zs = zoomSize(S);
  const gfade = g ? (reduce ? 0 : 1 - ease((now - g.t0) / CONFIG.memoryThreadFadeMs)) : 1;
  // the star the reader left through becomes the new centre, so it does not stay in the memory
  const via = g ? g.via : null;
  con.cx = cx;
  con.cy = cy;
  // a constellation wholly off screen costs nothing: it is not walked at all
  const reach = reachOf(con) * S + CONFIG.cullMargin;
  con.vis = !(cx + reach < 0 || cy + reach < 0 || cx - reach > w || cy - reach > h);
  if (!con.vis && !opt.mini) {
    con.count = 0;
    return 0;
  }
  const lod = opt.lod ?? 0;
  if (con.dim < CONFIG.dimCutoff && gfade <= 0) return 0;
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineWidth = 1;

  // the bloom: one ring of light sweeps outward and the new stars appear behind it
  if (!g && !reduce && !con.pending) {
    const u = (now - con.born) / CONFIG.bloomRingMs;
    if (u > 0 && u < 1) {
      const rr = CONFIG.rMax * ease(u) * S;
      const rgb = subjectRgb(con.subject);
      ctx.strokeStyle = 'rgba(' + rgb + ',' + (1 - u) * CONFIG.ringAlpha + ')';
      ctx.lineWidth = CONFIG.ringWidth;
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(' + rgb + ',' + (1 - u) * CONFIG.ringHaloAlpha + ')';
      ctx.lineWidth = CONFIG.ringHaloWidth * zs;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(0, rr - (CONFIG.ringHaloWidth / 2) * zs), 0, TAU);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
  }

  // threads
  strokeThreads(ctx, con, cx, cy, S, now, reduce, w, h, via, g ? gfade : null);

  let shown = 0;
  const m = CONFIG.cullMargin;
  for (const o of con.nodes) {
    const fp = flight(o.born, now, reduce);
    let s = fp <= 0 ? 0 : fp < 1 ? 0.3 + 0.7 * fp : 1;
    let al = con.dim * (fp < 1 ? Math.min(1, fp * 1.6) : 1);
    let sx = cx + o.dx * S;
    let sy = cy + o.dy * S;
    if (fp < 1) {
      // a new star rides the tip of its growing thread out from its parent
      const ax = o.par ? o.par.dx : 0;
      const ay = o.par ? o.par.dy : 0;
      const t = bez(ax, ay, o.dx, o.dy, o.bend, fp);
      sx = cx + t.ex * S;
      sy = cy + t.ey * S;
    }
    if (o.out) {
      // being cleared: it sinks, then drifts away from the new centre and fades; a soft mark only dims it
      const q = o.out;
      const e = reduce ? 1 : ease((now - q.t0) / (q.hard ? CONFIG.clearMs : CONFIG.roomMs));
      const k = q.hard ? q.k0 + (1 - q.k0) * e : (1 - CONFIG.roomAlpha) * e;
      al *= 1 - k;
      sx += q.ux * k * CONFIG.clearDrift * z;
      sy += q.uy * k * CONFIG.clearDrift * z;
      s *= 1 - k * 0.4;
      if (al <= CONFIG.dissolveCutoff) {
        o.a = 0;
        o.on = false;
        continue;
      }
    }
    if (g && (o.rank > CONFIG.memoryKeepRank || o === via)) {
      // dissolving: far stars blow outward and fade, the closest few stay as a faint memory
      const du = reduce ? 1 : ease((now - (g.t0 + o.gd)) / CONFIG.dissolveMs);
      al = 1 - du;
      if (al <= CONFIG.dissolveCutoff) {
        o.a = 0;
        o.on = false;
        continue;
      }
      sx += o.gux * du * CONFIG.dissolveDrift * z;
      sy += o.guy * du * CONFIG.dissolveDrift * z;
      s *= 1 - du * CONFIG.dissolveShrink;
    }
    o.a = s;
    if (s <= 0) {
      o.on = false;
      continue;
    }
    shown++;
    o.sx = sx;
    o.sy = sy;
    if (sx < -m || sy < -m || sx > w + m || sy > h + m) {
      o.on = false;
      continue;
    }
    o.on = true;
    if (o.dup) continue;
    if (lod >= 3 && o.rank === 5) {
      o.on = false;
      continue;
    }
    const far = lod >= 2 && o.rank >= 4;
    const tw = reduce || far ? 1 : 1 + Math.sin(now * CONFIG.twinkleSpeed * o.sp + o.ph) * CONFIG.twinkleAmount;
    const d = (CONFIG.size[o.rank] ?? 0) * zs * s * tw * CONFIG.glowScale * (far ? CONFIG.lodGlow : 1);
    ctx.globalAlpha = al * (CONFIG.starAlpha[o.rank] ?? 0) * Math.min(1, s);
    ctx.drawImage(sp.glow(o.subject), sx - d, sy - d, d * 2, d * 2);
    if (o.rank <= CONFIG.coreRank) {
      const d1 = d * CONFIG.coreScale;
      ctx.drawImage(sp.white, sx - d1, sy - d1, d1 * 2, d1 * 2);
    }
  }

  // points of light running inward along threads
  if (!reduce && opt.pulses && !g && lod < 1) {
    if (con.pulses.length < opt.pulses) con.pulses.push({ n: null, t0: now + con.pulses.length * CONFIG.pulseStaggerMs });
    for (const pu of con.pulses) {
      const u = (now - pu.t0) / CONFIG.pulseMs;
      if (u < 0) continue;
      if (u >= 1 || !pu.n || !pu.n.a) {
        pu.n = con.nodes[Math.floor(Math.random() * Math.min(con.nodes.length, CONFIG.pulsePool))] ?? null;
        pu.t0 = now + Math.random() * CONFIG.pulseRestMs;
        continue;
      }
      const n = pu.n;
      const ax = n.par ? n.par.dx : 0;
      const ay = n.par ? n.par.dy : 0;
      const e = 1 - u;
      const mx = (ax + n.dx) / 2 - (n.dy - ay) * n.bend;
      const my = (ay + n.dy) / 2 + (n.dx - ax) * n.bend;
      const X = e * e * n.dx + 2 * e * u * mx + u * u * ax;
      const Y = e * e * n.dy + 2 * e * u * my + u * u * ay;
      const d2 = CONFIG.pulseSize * zs;
      ctx.globalAlpha = Math.sin(u * Math.PI) * CONFIG.pulseAlpha;
      ctx.drawImage(sp.white, cx + X * S - d2, cy + Y * S - d2, d2 * 2, d2 * 2);
    }
  }

  // centre star, tinted by its subject
  const swell = con.arrivedAt !== undefined && !reduce ? 1 + CONFIG.centreBoost * Math.exp(-(now - con.arrivedAt) / (CONFIG.centreBoostMs / 3)) : 1;
  const cs = reduce || con.arrivedAt !== undefined ? 1 : spring((now - con.born) / CONFIG.centrePopMs);
  const cd =
    (opt.mini ? CONFIG.centreSizeMini : CONFIG.centreSize) *
    (opt.centreScale ?? 1) *
    zs *
    swell *
    (CONFIG.centreGrowFrom + (1 - CONFIG.centreGrowFrom) * cs) *
    (reduce ? 1 : 1 + Math.sin(now * CONFIG.centreBreatheSpeed) * CONFIG.centreBreatheAmount);
  if (con.pending && !reduce) {
    // waiting for its stars: a halo that grows and breathes, and sparks circling the star
    const wait = now - con.born;
    const grow = ease(wait / 900);
    const hd = CONFIG.haloSize * zs * (0.35 + 0.65 * grow) * (1 + Math.sin(wait * CONFIG.haloBreathe) * 0.08);
    ctx.globalAlpha = 0.55 * Math.min(1, wait / 250);
    ctx.drawImage(sp.glow(con.subject), cx - hd, cy - hd, hd * 2, hd * 2);
    const od = CONFIG.orbitSize * zs;
    for (let i = 0; i < CONFIG.orbitCount; i++) {
      const a = wait * CONFIG.orbitSpeed + (i / CONFIG.orbitCount) * TAU;
      const rr = CONFIG.orbitRadius * zs * (0.8 + 0.5 * grow) * (1 + 0.12 * Math.sin(wait * 0.003 + i));
      ctx.globalAlpha = 0.85 * Math.min(1, wait / 300);
      ctx.drawImage(sp.white, cx + Math.cos(a) * rr - od, cy + Math.sin(a) * rr - od, od * 2, od * 2);
    }
  }
  ctx.globalAlpha = Math.min(1, con.dim + (g ? CONFIG.memoryCentreBoost : 0));
  ctx.drawImage(sp.star(con.subject), cx - cd, cy - cd, cd * 2, cd * 2);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  con.count = shown;
  return shown;
}
