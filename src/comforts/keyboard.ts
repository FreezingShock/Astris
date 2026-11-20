/** Keyboard reach: "/" focuses the map's search, and links without an href act like links. */
export function initKeyboard(search: HTMLInputElement, onMap: () => boolean): void {
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && onMap() && document.activeElement !== search) {
      e.preventDefault();
      search.focus();
    }
  });
  document.querySelectorAll<HTMLAnchorElement>('a:not([href])').forEach((a) => {
    a.tabIndex = 0;
    a.setAttribute('role', 'link');
  });
  document.addEventListener('keydown', (e) => {
    const t = e.target;
    if (e.key === 'Enter' && t instanceof HTMLElement && t.matches('a:not([href])')) t.click();
  });
}
