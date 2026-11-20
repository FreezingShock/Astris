import { subjectRgb, token, prefersReducedMotion } from '../styles';
import type { SubjectId } from '../types';
import type { Tier } from './sound';

/** One falling spark of a celebration. Sizes are in CSS pixels, times in seconds. */
export interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  spin: number;
  angle: number;
  life: number;
  age: number;
  colour: number;
}

/** How many sparks each kind of finish throws. */
export const SPARKS: Record<Tier, number> = { finish: 36, par: 64, under: 110 };

/** The sparks for one burst from a point. A better finish throws more, higher and wider. */
export function makeSparks(tier: Tier, x: number, y: number, colours: number, rand: () => number = Math.random): Spark[] {
  const power = tier === 'under' ? 1.25 : tier === 'par' ? 1.1 : 0.9;
  return Array.from({ length: SPARKS[tier] }, () => {
    const a = -Math.PI / 2 + (rand() - 0.5) * Math.PI * 1.5;
    const v = (120 + rand() * 360) * power;
    return {
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      size: 4 + rand() * 7,
      spin: (rand() - 0.5) * 8,
      angle: rand() * Math.PI,
      life: 1.1 + rand() * 0.9,
      age: 0,
      colour: Math.floor(rand() * colours),
    };
  });
}

/** Move every spark forward by dt seconds. Returns the ones still alive. */
export function stepSparks(sparks: Spark[], dt: number): Spark[] {
  for (const s of sparks) {
    s.age += dt;
    s.vy += 420 * dt;
    s.vx *= 1 - 1.4 * dt;
    s.vy *= 1 - 0.9 * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.angle += s.spin * dt;
  }
  return sparks.filter((s) => s.age < s.life);
}

/**
 * A burst of four-point stars over the map when a race is won.
 * It draws on its own canvas above the map, ignores the pointer, and stops its animation loop when nothing is left.
 * With reduced motion it draws nothing at all.
 */
export class Celebration {
  private readonly canvas: HTMLCanvasElement;
  private sparks: Spark[] = [];
  private frame = 0;
  private last = 0;
  private palette: string[] = [];

  constructor(host: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'fx';
    this.canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(this.canvas);
  }

  /** Throw a burst from the middle of an element, in the colours of the sky and of the article that was reached. */
  burst(tier: Tier, from: HTMLElement, subject: SubjectId): void {
    if (prefersReducedMotion()) return;
    const box = this.canvas.getBoundingClientRect();
    const at = from.getBoundingClientRect();
    this.palette = [token('--neb-rose'), token('--neb-blue'), token('--neb-violet'), token('--starlight'), 'rgb(' + subjectRgb(subject) + ')'];
    const x = at.left + at.width / 2 - box.left;
    const y = at.top + at.height * 0.7 - box.top;
    this.sparks.push(...makeSparks(tier, x, y, this.palette.length));
    if (tier === 'under')
      this.sparks.push(...makeSparks('par', box.width * 0.2, box.height * 0.8, this.palette.length), ...makeSparks('par', box.width * 0.8, box.height * 0.8, this.palette.length));
    if (!this.frame) {
      this.last = performance.now();
      this.frame = requestAnimationFrame((t) => this.tick(t));
    }
  }

  private tick(now: number): void {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.sparks = stepSparks(this.sparks, dt);
    this.draw();
    this.frame = this.sparks.length ? requestAnimationFrame((t) => this.tick(t)) : 0;
  }

  private draw(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    const g = this.canvas.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    for (const s of this.sparks) {
      const k = s.age / s.life;
      g.globalAlpha = Math.min(1, (1 - k) * 2);
      g.fillStyle = this.palette[s.colour] ?? '';
      g.shadowColor = this.palette[s.colour] ?? '';
      g.shadowBlur = 8;
      g.save();
      g.translate(s.x, s.y);
      g.rotate(s.angle);
      const r = s.size * (1 - k * 0.4);
      g.beginPath();
      g.moveTo(0, -r);
      g.quadraticCurveTo(r * 0.12, -r * 0.12, r, 0);
      g.quadraticCurveTo(r * 0.12, r * 0.12, 0, r);
      g.quadraticCurveTo(-r * 0.12, r * 0.12, -r, 0);
      g.quadraticCurveTo(-r * 0.12, -r * 0.12, 0, -r);
      g.fill();
      g.restore();
    }
    g.globalAlpha = 1;
  }
}
