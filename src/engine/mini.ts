import type { Constellation } from '../types';
import { prefersReducedMotion, token } from '../styles';
import { CONFIG } from './config';
import { drawCon } from './draw';
import { makeCon } from './layout';
import type { Con } from './model';
import { sprites } from './sprites';

/** A small self-running constellation with no input, for the main page. */
export class MiniMap {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly reduce = prefersReducedMotion();
  private con: Con | null = null;
  private raf = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly data: Constellation,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
  }

  /** Draw, and keep drawing while `visible` stays true. */
  start(visible: () => boolean): void {
    cancelAnimationFrame(this.raf);
    const tick = (): void => {
      cancelAnimationFrame(this.raf);
      if (!visible()) return;
      const mini = this.canvas;
      const r = mini.getBoundingClientRect();
      const d = Math.min(CONFIG.maxPixelRatio, window.devicePixelRatio || 1);
      if (!r.width) return;
      if (mini.width !== Math.round(r.width * d)) {
        mini.width = Math.round(r.width * d);
        mini.height = Math.round(r.height * d);
      }
      const now = performance.now();
      if (!this.con) this.con = makeCon(this.data, 0, 0, now, 200);
      const ctx = this.ctx;
      ctx.setTransform(d, 0, 0, d, 0, 0);
      ctx.clearRect(0, 0, r.width, r.height);
      drawCon(ctx, this.con, { x: 0, y: 0, z: Math.min(r.width, r.height * 1.5) / 760 }, now, r.width, r.height, { pulses: 5, mini: true }, sprites(), this.reduce);
      ctx.font = '600 15px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = token('--starlight');
      ctx.fillText(this.data.center.title, r.width / 2, r.height / 2 + 34);
      if (!this.reduce) this.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
  }
}
