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

const TAU = 6.2832;

/** Draw one constellation into any 2D context. Returns the number of stars drawn. */
export function drawCon(ctx: CanvasRenderingContext2D, con: Con, cam: Camera, now: number, w: number, h: number, opt: DrawOptions, sp: Sprites, reduce: boolean): number {
  const z = cam.z;
  const S = z * con.sc;
  const cx = w / 2 + (con.x - cam.x) * z;
  const cy = h / 2 + (con.y - cam.y) * z;
  const g = con.ghost;
  const zs = Math.max(0.55, Math.min(2.2, Math.sqrt(S)));
  const gfade = g ? 1 - ease((now - g.t0) / 420) : 1;
  con.cx = cx;
  con.cy = cy;
  if (con.dim < 0.015 && gfade <= 0) return 0;
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineWidth = 1;

  // the bloom: one ring of light sweeps outward and the new stars appear behind it
  if (!g && !reduce) {
    const u = (now - con.born) / CONFIG.bloomRingMs;
    if (u > 0 && u < 1) {
      const rr = CONFIG.rMax * ease(u) * S;
      const rgb = subjectRgb(con.subject);
      ctx.strokeStyle = 'rgba(' + rgb + ',' + (1 - u) * 0.55 + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(' + rgb + ',' + (1 - u) * 0.07 + ')';
      ctx.lineWidth = 22 * zs;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(0, rr - 11 * zs), 0, TAU);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
  }

  // threads, batched by subject and rank
  for (const G of con.groups) {
    const ta = (CONFIG.threadAlpha[G.rank] ?? 0) * (g ? (G.rank <= 2 ? con.dim : gfade) : con.dim);
    if (ta < 0.008) continue;
    ctx.strokeStyle = 'rgba(' + subjectRgb(G.subject) + ',' + ta + ')';
    ctx.beginPath();
    for (const o of G.nodes) {
      const p = reduce ? 1 : ease((now - (o.born - CONFIG.threadDrawMs)) / CONFIG.threadDrawMs);
      if (p <= 0) continue;
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
  for (const o of con.nodes) {
    let s = reduce ? 1 : spring((now - o.born) / CONFIG.starPopMs);
    let al = con.dim;
    let sx = cx + o.dx * S;
    let sy = cy + o.dy * S;
    if (g && o.rank > 2) {
      // dissolving: far stars blow outward and fade, the closest few stay as a faint memory
      const du = reduce ? 1 : ease((now - (g.t0 + o.gd)) / CONFIG.dissolveMs);
      al = 1 - du;
      if (al <= 0.01) {
        o.a = 0;
        o.on = false;
        continue;
      }
      sx += o.gux * du * CONFIG.dissolveDrift * z;
      sy += o.guy * du * CONFIG.dissolveDrift * z;
      s *= 1 - du * 0.5;
    }
    o.a = s;
    if (s <= 0) {
      o.on = false;
      continue;
    }
    shown++;
    o.sx = sx;
    o.sy = sy;
    if (sx < -30 || sy < -30 || sx > w + 30 || sy > h + 30) {
      o.on = false;
      continue;
    }
    o.on = true;
    const tw = reduce ? 1 : 1 + Math.sin(now * 0.001 * o.sp * 2.2 + o.ph) * 0.16;
    const d = (CONFIG.size[o.rank] ?? 0) * zs * s * tw * 2.1;
    ctx.globalAlpha = al * (CONFIG.starAlpha[o.rank] ?? 0) * Math.min(1, s);
    ctx.drawImage(sp.glow(o.subject), sx - d, sy - d, d * 2, d * 2);
    if (o.rank === 1) {
      const d1 = d * 0.5;
      ctx.drawImage(sp.white, sx - d1, sy - d1, d1 * 2, d1 * 2);
    }
  }

  // points of light running inward along threads
  if (!reduce && opt.pulses && !g) {
    if (con.pulses.length < opt.pulses) con.pulses.push({ n: null, t0: now + con.pulses.length * 240 });
    for (const pu of con.pulses) {
      const u = (now - pu.t0) / CONFIG.pulseMs;
      if (u < 0) continue;
      if (u >= 1 || !pu.n || !pu.n.a) {
        pu.n = con.nodes[Math.floor(Math.random() * Math.min(con.nodes.length, 90))] ?? null;
        pu.t0 = now + Math.random() * 900;
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
      const d2 = 5 * zs;
      ctx.globalAlpha = Math.sin(u * Math.PI) * 0.9;
      ctx.drawImage(sp.white, cx + X * S - d2, cy + Y * S - d2, d2 * 2, d2 * 2);
    }
  }

  // centre star, tinted by its subject
  const cs = reduce ? 1 : spring((now - con.born) / CONFIG.centrePopMs);
  const cd = (opt.mini ? 20 : 30) * zs * (0.35 + 0.65 * cs) * (reduce ? 1 : 1 + Math.sin(now * 0.0016) * 0.05);
  ctx.globalAlpha = Math.min(1, con.dim + (g ? 0.25 : 0));
  ctx.drawImage(sp.star(con.subject), cx - cd, cy - cd, cd * 2, cd * 2);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  con.count = shown;
  return shown;
}
