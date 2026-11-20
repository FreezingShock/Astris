import { hash } from '../lib';

/** A five-note scale (major pentatonic) in Hz, so any two notes played together sound kind. */
const SCALE = [392.0, 440.0, 493.88, 587.33, 659.25, 783.99, 880.0, 987.77];

/** How a race ended, which sets how much the finish celebrates. */
export type Tier = 'finish' | 'par' | 'under';

/** The note an article rings with. The same title always rings the same note. */
export function noteFor(title: string): number {
  return SCALE[hash(title) % SCALE.length] ?? SCALE[0] ?? 392;
}

/** The notes of the finish flourish, rising: more of them for a better finish. */
export function flourish(tier: Tier): number[] {
  const steps = tier === 'under' ? [0, 2, 4, 5, 7] : tier === 'par' ? [0, 2, 4, 5] : [0, 2, 4];
  return steps.map((i) => SCALE[i] ?? 392);
}

/** How a finished race compares with par. */
export function tierOf(clicks: number, par: number | null): Tier {
  if (par === null || par < 0) return 'finish';
  return clicks < par ? 'under' : clicks === par ? 'par' : 'finish';
}

export const SOUND_KEY = 'astris:sound';

interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStore(): Store | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * Soft sounds for arriving at a star and finishing a race. Off until the reader turns it on,
 * and the choice is remembered. The audio context is only made after the reader's own click,
 * because browsers refuse to play sound before one.
 */
export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private on: boolean;

  constructor(private readonly store: Store | null = browserStore()) {
    this.on = this.read() === 'on';
  }

  /** True when sound is turned on. */
  get enabled(): boolean {
    return this.on;
  }

  private read(): string | null {
    try {
      return this.store?.getItem(SOUND_KEY) ?? null;
    } catch {
      return null;
    }
  }

  /** Turn sound on or off, remember it, and ring a note when turning it on so the reader hears that it works. */
  set(on: boolean): void {
    this.on = on;
    try {
      this.store?.setItem(SOUND_KEY, on ? 'on' : 'off');
    } catch {
      /* private mode: the choice lasts until the page closes */
    }
    if (on) this.tone(noteFor('Astris'), 0, 0.5);
  }

  private context(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = typeof window === 'undefined' ? undefined : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!Ctor) return null;
    try {
      const ctx = new Ctor();
      const master = ctx.createGain();
      master.gain.value = 0.5;
      // A faint echo gives each note a little air.
      const delay = ctx.createDelay(1);
      delay.delayTime.value = 0.23;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.28;
      delay.connect(feedback).connect(delay);
      master.connect(ctx.destination);
      master.connect(delay).connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
      return ctx;
    } catch {
      return null;
    }
  }

  /** One soft bell: a sine and a quiet octave above it, with a quick attack and a long fade. */
  private tone(freq: number, delay: number, level: number): void {
    const ctx = this.context();
    if (!ctx || !this.master) return;
    if (ctx.state === 'suspended') void ctx.resume();
    const t = ctx.currentTime + delay;
    for (const [mult, share] of [
      [1, 1],
      [2, 0.28],
    ] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq * mult;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.09 * level * share, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
      osc.connect(gain).connect(this.master);
      osc.start(t);
      osc.stop(t + 1.4);
    }
  }

  /** The note for arriving at an article. Silent while sound is off. */
  arrive(title: string): void {
    if (this.on) this.tone(noteFor(title), 0, 0.7);
  }

  /** The flourish for finishing a race. Silent while sound is off. */
  win(tier: Tier): void {
    if (!this.on) return;
    flourish(tier).forEach((f, i) => this.tone(f, i * 0.11, 0.9));
    if (tier === 'under') this.tone((flourish(tier)[0] ?? 392) * 2, 0.6, 0.8);
  }
}
