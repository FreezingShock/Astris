import { vi } from 'vitest';

/**
 * Just enough of a browser for the engine to run under Node: a canvas whose
 * context accepts every call, a clock the test moves by hand, and frames the test steps.
 */
export interface FakeDom {
  canvas: HTMLCanvasElement;
  /** Fire a listener the engine put on the canvas. */
  fire(type: string, event?: Record<string, unknown>): void;
  /** Move the clock forward and run the frame that was asked for, if any. */
  step(ms?: number): void;
  /** Run frames until the clock has moved this far. */
  run(ms: number, frameMs?: number): void;
  now(): number;
  /** Every call made on the canvas context, by method name. */
  calls: Map<string, unknown[][]>;
}

export function fakeDom(width = 1200, height = 800, reducedMotion = false): FakeDom {
  let clock = 1000;
  let pending: ((now: number) => void) | null = null;
  const calls = new Map<string, unknown[][]>();
  const listeners = new Map<string, ((event: unknown) => void)[]>();

  const context = (): unknown =>
    new Proxy<Record<string, unknown>>(
      {},
      {
        get(store, key) {
          if (typeof key !== 'string' || key in store) return store[key as string];
          return (...args: unknown[]) => {
            const list = calls.get(key) ?? [];
            list.push(args);
            calls.set(key, list);
            if (key === 'measureText') return { width: String(args[0]).length * 7 };
            if (key === 'createRadialGradient') return { addColorStop() {} };
            return undefined;
          };
        },
        set(store, key, value) {
          store[key as string] = value;
          return true;
        },
      },
    );

  const makeCanvas = (): Record<string, unknown> => {
    const ctx = context();
    return {
      width: 0,
      height: 0,
      style: {},
      classList: { add() {}, remove() {} },
      getContext: () => ctx,
      getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
      setPointerCapture() {},
      addEventListener(type: string, fn: (event: unknown) => void) {
        listeners.set(type, [...(listeners.get(type) ?? []), fn]);
      },
    };
  };

  vi.stubGlobal('document', { documentElement: {}, createElement: makeCanvas });
  vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: (name: string) => (name.endsWith('-rgb') || name.startsWith('--subject-') ? '1, 2, 3' : 'white') }));
  vi.stubGlobal('matchMedia', () => ({ matches: reducedMotion }));
  vi.stubGlobal('window', { devicePixelRatio: 1 });
  vi.stubGlobal('performance', { now: () => clock });
  vi.stubGlobal('requestAnimationFrame', (fn: (now: number) => void) => {
    pending = fn;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {
    pending = null;
  });

  const dom: FakeDom = {
    canvas: makeCanvas() as unknown as HTMLCanvasElement,
    fire(type, event = {}) {
      for (const fn of listeners.get(type) ?? []) fn({ type, pointerId: 1, clientX: 0, clientY: 0, preventDefault() {}, ...event });
    },
    step(ms = 16) {
      clock += ms;
      const fn = pending;
      pending = null;
      fn?.(clock);
    },
    run(ms, frameMs = 16) {
      for (let t = 0; t < ms; t += frameMs) dom.step(frameMs);
    },
    now: () => clock,
    calls,
  };
  return dom;
}
