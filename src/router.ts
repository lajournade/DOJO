/**
 * Routeur minimal sur l'History API : quatre ecrans, et le geste de retour iOS
 * qui fonctionne. Une bibliotheque complete serait plus lourde que le besoin.
 */
import { useSyncExternalStore } from 'react';

export type Route = '/' | '/arena' | '/history' | '/program' | '/results';

const listeners = new Set<() => void>();

function normalize(path: string): Route {
  const known: Route[] = ['/', '/arena', '/history', '/program', '/results'];
  return known.includes(path as Route) ? (path as Route) : '/';
}

let current: Route = normalize(window.location.pathname);

window.addEventListener('popstate', () => {
  current = normalize(window.location.pathname);
  listeners.forEach((l) => l());
});

export function navigate(to: Route, options: { replace?: boolean } = {}) {
  if (to === current && !options.replace) return;
  current = to;
  window.history[options.replace ? 'replaceState' : 'pushState']({}, '', to);
  listeners.forEach((l) => l());
}

export function useRoute(): Route {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}
