import type { SubjectId } from '../types';
import { subjectRgb, token } from '../styles';

/** Pre-rendered light: glow sprites drawn with additive blending. Colour is the subject. */
export interface Sprites {
  /** A soft glow in the subject's colour. */
  glow(subject: SubjectId): HTMLCanvasElement;
  /** The four-point centre star in the subject's colour. */
  star(subject: SubjectId): HTMLCanvasElement;
  /** A pure white glow, for rank 1 cores and travelling light. */
  white: HTMLCanvasElement;
  /** A tile of faint background stars. */
  dust: HTMLCanvasElement;
}

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  if (!x) throw new Error('Canvas 2D is not available');
  return [c, x];
}

function glowSprite(rgb: string, core: number): HTMLCanvasElement {
  const [c, x] = canvas(64);
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(' + token('--white-rgb') + ',' + core + ')');
  g.addColorStop(0.1, 'rgba(' + rgb + ',.95)');
  g.addColorStop(0.3, 'rgba(' + rgb + ',.32)');
  g.addColorStop(1, 'rgba(' + rgb + ',0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return c;
}

function starSprite(rgb: string): HTMLCanvasElement {
  const [c, x] = canvas(128);
  const white = token('--white-rgb');
  x.translate(64, 64);
  const g = x.createRadialGradient(0, 0, 0, 0, 0, 62);
  g.addColorStop(0, 'rgba(' + rgb + ',.6)');
  g.addColorStop(1, 'rgba(' + rgb + ',0)');
  x.fillStyle = g;
  x.fillRect(-64, -64, 128, 128);
  const s = x.createRadialGradient(0, 0, 0, 0, 0, 44);
  s.addColorStop(0, 'rgb(' + white + ')');
  s.addColorStop(0.35, 'rgba(' + white + ',.92)');
  s.addColorStop(1, 'rgb(' + rgb + ')');
  x.fillStyle = s;
  x.beginPath();
  x.moveTo(0, -44);
  x.quadraticCurveTo(4.4, -4.4, 44, 0);
  x.quadraticCurveTo(4.4, 4.4, 0, 44);
  x.quadraticCurveTo(-4.4, 4.4, -44, 0);
  x.quadraticCurveTo(-4.4, -4.4, 0, -44);
  x.fill();
  return c;
}

function dustSprite(): HTMLCanvasElement {
  const [c, x] = canvas(512);
  const tintA = token('--dust-a-rgb');
  const tintB = token('--dust-b-rgb');
  let s = 7;
  for (let i = 0; i < 150; i++) {
    s = (s * 16807) % 2147483647;
    const px = s % 512;
    s = (s * 16807) % 2147483647;
    const py = s % 512;
    s = (s * 16807) % 2147483647;
    const a = 0.12 + (s % 100) / 220;
    const r = s % 7 === 0 ? 1.3 : 0.7;
    x.fillStyle = 'rgba(' + (i % 5 === 0 ? tintA : tintB) + ',' + a + ')';
    x.beginPath();
    x.arc(px, py, r, 0, 6.3);
    x.fill();
  }
  return c;
}

let shared: Sprites | null = null;

/** The sprite set, built once on first use. Call after stylesReady(). */
export function sprites(): Sprites {
  if (shared) return shared;
  const glows = new Map<string, HTMLCanvasElement>();
  const stars = new Map<string, HTMLCanvasElement>();
  shared = {
    glow(subject) {
      const rgb = subjectRgb(subject);
      let c = glows.get(rgb);
      if (!c) glows.set(rgb, (c = glowSprite(rgb, 0.9)));
      return c;
    },
    star(subject) {
      const rgb = subjectRgb(subject);
      let c = stars.get(rgb);
      if (!c) stars.set(rgb, (c = starSprite(rgb)));
      return c;
    },
    white: glowSprite(token('--white-rgb'), 1),
    dust: dustSprite(),
  };
  return shared;
}
