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
}

const TAU = Math.PI * 2;

/** How much stars and titles grow with the zoom: its square root, clamped. */
export function zoomSize(scale: number): number {
  return Math.max(CONFIG.zoomSizeMin, Math.min(CONFIG.zoomSizeMax, Math.sqrt(scale)));
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
  if (con.dim < CONFIG.dimCutoff && gfade <= 0) return 0;
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineWidth = 1;

  // the bloom: one ring of light sweeps outward and the new stars appear behind it
  if (!g && !reduce) {
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

  // threads, batched by subject and rank
  for (const G of con.groups) {
    const ta = (CONFIG.threadAlpha[G.rank] ?? 0) * (g ? (G.rank <= CONFIG.memoryKeepRank ? con.dim : gfade) : con.dim);
    if (ta < CONFIG.threadCutoff) continue;
    ctx.strokeStyle = 'rgba(' + subjectRgb(G.subject) + ',' + ta + ')';
    ctx.beginPath();
    for (const o of G.nodes) {
      const p = reduce ? 1 : ease((now - (o.born - CONFIG.threadDrawMs)) / CONFIG.threadDrawMs);
      if (p <= 0 || (via && (o === via || o.par === via))) continue;
      const ax = o.par ? cx + o.par.dx * S : cx;
      const ay = o.par ? cy + o.par.dy * S : cy;
      const bx = cx + o.dx * S;
      const by = cy + o.dy * S;
      if ((ax < 0 && bx < 0) || (ax > w && bx > w) || (ay < 0 && by < 0) || (ay > h && by > h)) continue;
      const mx = (ax + bx) / 2 - (by - ay) * o.bend;
      const my = (ay + by) / 2 + (bx - ax) * o.bend;
      const qx = ax + (mx - ax) * p;
      const qy = ay + (my - ay) * p;
      const ex = qx + (mx + (bx - mx) * p - qx) * p;
      const ey = qy + (my + (by - my) * p - qy) * p;
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo(qx, qy, ex, ey);
    }
    ctx.stroke();
  }

  let shown = 0;
  const m = CONFIG.cullMargin;
  for (const o of con.nodes) {
    let s = reduce ? 1 : spring((now - o.born) / CONFIG.starPopMs);
    let al = con.dim;
    let sx = cx + o.dx * S;
    let sy = cy + o.dy * S;
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
    const tw = reduce ? 1 : 1 + Math.sin(now * CONFIG.twinkleSpeed * o.sp + o.ph) * CONFIG.twinkleAmount;
    const d = (CONFIG.size[o.rank] ?? 0) * zs * s * tw * CONFIG.glowScale;
    ctx.globalAlpha = al * (CONFIG.starAlpha[o.rank] ?? 0) * Math.min(1, s);
    ctx.drawImage(sp.glow(o.subject), sx - d, sy - d, d * 2, d * 2);
    if (o.rank <= CONFIG.coreRank) {
      const d1 = d * CONFIG.coreScale;
      ctx.drawImage(sp.white, sx - d1, sy - d1, d1 * 2, d1 * 2);
    }
  }

  // points of light running inward along threads
  if (!reduce && opt.pulses && !g) {
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
  const cs = reduce ? 1 : spring((now - con.born) / CONFIG.centrePopMs);
  const cd =
    (opt.mini ? CONFIG.centreSizeMini : CONFIG.centreSize) *
    zs *
    (CONFIG.centreGrowFrom + (1 - CONFIG.centreGrowFrom) * cs) *
    (reduce ? 1 : 1 + Math.sin(now * CONFIG.centreBreatheSpeed) * CONFIG.centreBreatheAmount);
  ctx.globalAlpha = Math.min(1, con.dim + (g ? CONFIG.memoryCentreBoost : 0));
  ctx.drawImage(sp.star(con.subject), cx - cd, cy - cd, cd * 2, cd * 2);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  con.count = shown;
  return shown;
}
