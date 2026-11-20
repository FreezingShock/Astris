/** True when the reader asked the system for reduced motion. */
function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Run an animation again on an element: take the class off, force a layout, put it back. */
export function replay(el: HTMLElement, cls: string): void {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

/** Scroll behaviour that follows the visitor's motion setting. */
export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? 'auto' : 'smooth';
}

/** Scroll to an element and light it up for a moment. Does nothing when the element is missing. */
export function jumpTo(el: HTMLElement | null): void {
  if (!el) return;
  el.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
  if (!prefersReducedMotion()) replay(el, 'flash');
}
