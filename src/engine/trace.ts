import type { Constellation, Rank, Star } from '../types';
import { SUBJECTS } from '../styles';
import { CONFIG } from './config';
import { Engine } from './engine';

/**
 * The performance trace: grows a full constellation, travels until the map holds
 * its memories, and times every frame. Run by scripts/trace-engine.mjs, and not part of the site.
 */
export interface TraceOptions {
  /** Stars per constellation. The spec's budget is 120. */
  stars?: number;
  /** Memories to leave behind before measuring. The spec's budget is three. */
  memories?: number;
  /** How long to measure the settled map, after the last travel has finished. */
  settledMs?: number;
}

export interface FrameTimes {
  frames: number;
  /** Frames per second over the whole phase. */
  fps: number;
  meanMs: number;
  p95Ms: number;
  worstMs: number;
  /** Share of frames that took longer than one and a half frames at 60 per second. */
  slowShare: number;
}

export interface TraceResult {
  stars: number;
  memories: number;
  /** Stars drawn in the last frame, across the live constellation and its memories. */
  starsDrawn: number;
  /** From each click until its travel has finished: bloom, dissolve and the camera move. */
  travel: FrameTimes;
  /** The settled map: twinkle, travelling light and titles. */
  settled: FrameTimes;
}

/** How many of every hundred stars fall in each rank, 1 to 5. */
const RANK_SHARE = [0, 8, 24, 30, 26, 12];
/** A frame at 60 per second, and how much longer a frame may take before it counts as slow. */
const FRAME_MS = 1000 / 60;
const SLOW_FACTOR = 1.5;
/** Travel is measured from the click until the last star has landed. */
const TRAVEL_MS = CONFIG.bloomLeadMs + CONFIG.bloomSpreadMs + CONFIG.bloomJitterMs + CONFIG.starPopMs;

/** A made-up constellation of a given size, the same every time for the same title. */
export function syntheticConstellation(title: string, stars = 120): Constellation {
  const offset = title.length;
  const subject = (i: number): string => SUBJECTS[(i + offset) % SUBJECTS.length] ?? 'Unknown';
  const list: Star[] = [];
  let rank: Rank = 1;
  let quota = 0;
  for (let i = 0; i < stars; i++) {
    while (rank < 5 && i >= quota + ((RANK_SHARE[rank] ?? 0) * stars) / 100) {
      quota += ((RANK_SHARE[rank] ?? 0) * stars) / 100;
      rank = (rank + 1) as Rank;
    }
    // five subjects share most of the sky, as in a real article
    list.push({ title: title + ' star ' + (i + 1), subject: subject((i * 7) % 5), linksOut: rank <= 3, linksIn: rank <= 2, nameMatch: rank === 1, rank, score: stars - i });
  }
  return { center: { title, subject: subject(0) }, stars: list };
}

/** Summarise the gaps between frame timestamps. */
export function frameTimes(stamps: readonly number[]): FrameTimes {
  const gaps: number[] = [];
  for (let i = 1; i < stamps.length; i++) gaps.push((stamps[i] ?? 0) - (stamps[i - 1] ?? 0));
  if (!gaps.length) return { frames: 0, fps: 0, meanMs: 0, p95Ms: 0, worstMs: 0, slowShare: 0 };
  const sorted = [...gaps].sort((a, b) => a - b);
  const total = gaps.reduce((a, b) => a + b, 0);
  const meanMs = total / gaps.length;
  return {
    frames: gaps.length,
    fps: 1000 / meanMs,
    meanMs,
    p95Ms: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0,
    worstMs: sorted[sorted.length - 1] ?? 0,
    slowShare: gaps.filter((g) => g > FRAME_MS * SLOW_FACTOR).length / gaps.length,
  };
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Run the trace on a canvas that is already in the page and sized by CSS. */
export async function runTrace(canvas: HTMLCanvasElement, options: TraceOptions = {}): Promise<TraceResult> {
  const stars = options.stars ?? 120;
  const memories = options.memories ?? CONFIG.maxMemories;
  const settledMs = options.settledMs ?? 5000;
  let stamps: number[] = [];
  let starsDrawn = 0;
  const engine = new Engine(canvas, {
    onFrame(stats, now) {
      stamps.push(now);
      starsDrawn = stats.stars;
    },
  });
  engine.enable();
  engine.reset(syntheticConstellation('Trace 0', stars));
  await wait(TRAVEL_MS);

  const travelStamps: number[][] = [];
  for (let hop = 1; hop <= memories; hop++) {
    // travel through a star of the live constellation, as a click would
    const via = engine.current?.nodes[hop * 7]?.title ?? 'Trace ' + hop;
    stamps = [];
    engine.travel(syntheticConstellation(via, stars));
    await wait(TRAVEL_MS);
    travelStamps.push(stamps);
  }

  stamps = [];
  await wait(settledMs);
  const settled = frameTimes(stamps);
  engine.disable();

  // each travel is its own run of frames, so the gaps between travels are not counted
  const gaps = travelStamps.map(frameTimes);
  const frames = gaps.reduce((a, g) => a + g.frames, 0);
  const meanMs = frames ? gaps.reduce((a, g) => a + g.meanMs * g.frames, 0) / frames : 0;
  const travel: FrameTimes = {
    frames,
    fps: meanMs ? 1000 / meanMs : 0,
    meanMs,
    p95Ms: Math.max(0, ...gaps.map((g) => g.p95Ms)),
    worstMs: Math.max(0, ...gaps.map((g) => g.worstMs)),
    slowShare: frames ? gaps.reduce((a, g) => a + g.slowShare * g.frames, 0) / frames : 0,
  };
  return { stars, memories: engine.memories.length, starsDrawn, travel, settled };
}
