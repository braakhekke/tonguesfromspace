/** The wizard's address is a path: /onboard/<region>/<glacier>/<step>. A few lines of router, no framework. */
const listeners = new Set<() => void>();
export const parts = () => location.pathname.replace(/^\/onboard\/?/, '').split('/').filter(Boolean);
export function go(path: string, search = '', replace = false) {
  history[replace ? 'replaceState' : 'pushState'](null, '', path + search);
  listeners.forEach((f) => f());
  if (!replace) scrollTo(0, 0);
}
export const onRoute = (f: () => void) => { listeners.add(f); addEventListener('popstate', f); return () => { listeners.delete(f); removeEventListener('popstate', f); }; };
