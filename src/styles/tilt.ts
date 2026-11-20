/**
 * Pointer tilt for site surfaces: each box leans a few degrees toward the pointer and a soft sheen follows it.
 * One delegated listener, one frame per move, and nothing at all for touch screens or reduced motion.
 */
const SELECTOR = '.box, .welcome, .tile';
const MAX = 4.5; // degrees

export function initTilt(): void {
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  if (calm.matches || !fine.matches) return;

  let el: HTMLElement | null = null;
  let frame = 0;
  let x = 0;
  let y = 0;

  const paint = (): void => {
    frame = 0;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = Math.min(1, Math.max(0, (x - r.left) / r.width));
    const py = Math.min(1, Math.max(0, (y - r.top) / r.height));
    el.style.setProperty('--ry', `${((px - 0.5) * 2 * MAX).toFixed(2)}deg`);
    el.style.setProperty('--rx', `${((0.5 - py) * 2 * MAX).toFixed(2)}deg`);
    el.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
    el.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
    el.style.setProperty('--spec', '1');
  };
  const rest = (node: HTMLElement): void => {
    node.style.setProperty('--rx', '0deg');
    node.style.setProperty('--ry', '0deg');
    node.style.setProperty('--spec', '0');
  };

  document.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') return;
      const hit = e.target instanceof Element ? e.target.closest<HTMLElement>(SELECTOR) : null;
      if (hit !== el) {
        if (el) rest(el);
        el = hit;
      }
      if (!el) return;
      x = e.clientX;
      y = e.clientY;
      if (!frame) frame = requestAnimationFrame(paint);
    },
    { passive: true },
  );
  document.addEventListener('pointerleave', () => {
    if (el) rest(el);
    el = null;
  });
}
