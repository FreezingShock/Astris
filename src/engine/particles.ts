import type { SubjectId } from '../types';
import type { Camera } from './model';
import type { Sprites } from './sprites';

/** One mote of light in map space: it drifts, slows and fades over its life. */
export interface Particle {
  x: number;
  y: number;
  /** Velocity in map units per millisecond. */
  vx: number;
  vy: number;
  /** When it appears (it waits invisible until then) and how long it lives, in milliseconds. */
  t0: number;
  life: number;
  /** Half-size in screen pixels, and peak brightness. */
  size: number;
  a: number;
  subject: SubjectId;
  /** Share of its speed it keeps by the end of its life. */
  keep: number;
}

/**
 * The map's particles: the trail along a journey, the burst on arrival and the dust of stars cleared away.
 * One shared pool with a hard cap, so that the cost per frame is bounded however much travelling happens.
 * Pure data and one draw call per particle: no DOM beyond the context it is given.
 */
export class Particles {
  private list: Particle[] = [];

  constructor(private readonly cap: number) {}

  get count(): number {
    return this.list.length;
  }

  clear(): void {
    this.list.length = 0;
  }

  add(p: Particle): void {
    if (this.list.length >= this.cap) this.list.shift();
    this.list.push(p);
  }

  /** Motes thrown outward in a ring from a point. */
  burst(x: number, y: number, subject: SubjectId, n: number, now: number, speed: number, life: number, size: number): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (i % 3) * 0.21;
      const v = speed * (0.55 + ((i * 0.618) % 1) * 0.6);
      this.add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t0: now, life: life * (0.7 + ((i * 0.37) % 1) * 0.5), size, a: 0.9, subject, keep: 0.15 });
    }
  }

  /** Motes strung along a line from one point to another, appearing one after another as if shed by the traveller. */
  trail(x0: number, y0: number, x1: number, y1: number, subject: SubjectId, n: number, now: number, span: number, life: number, size: number): void {
    for (let i = 0; i < n; i++) {
      const u = i / Math.max(1, n - 1);
      const side = i % 2 ? 1 : -1;
      const dx = x1 - x0;
      const dy = y1 - y0;
      const len = Math.hypot(dx, dy) || 1;
      this.add({
        x: x0 + dx * u,
        y: y0 + dy * u,
        vx: (-dy / len) * side * 0.012,
        vy: (dx / len) * side * 0.012,
        t0: now + u * span,
        life,
        size: size * (0.6 + ((i * 0.618) % 1) * 0.8),
        a: 0.8,
        subject,
        keep: 0.3,
      });
    }
  }

  /** Draw every live mote, dropping the ones that have faded. Call with additive blending on. */
  draw(ctx: CanvasRenderingContext2D, cam: Camera, w: number, h: number, now: number, sp: Sprites): void {
    const keep: Particle[] = [];
    for (const p of this.list) {
      const age = now - p.t0;
      if (age < 0) {
        keep.push(p);
        continue;
      }
      const u = age / p.life;
      if (u >= 1) continue;
      keep.push(p);
      // speed falls off linearly towards `keep` of itself
      const drift = age * (1 - (1 - p.keep) * u * 0.5);
      const sx = w / 2 + (p.x + p.vx * drift - cam.x) * cam.z;
      const sy = h / 2 + (p.y + p.vy * drift - cam.y) * cam.z;
      if (sx < -20 || sy < -20 || sx > w + 20 || sy > h + 20) continue;
      const d = p.size * (1 - u * 0.5);
      ctx.globalAlpha = p.a * (1 - u) * (1 - u);
      ctx.drawImage(sp.glow(p.subject), sx - d, sy - d, d * 2, d * 2);
    }
    ctx.globalAlpha = 1;
    this.list = keep;
  }
}
