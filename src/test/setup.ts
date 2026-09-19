/**
 * Prepare jsdom pour rendre l'application : ce que le navigateur fournit et que
 * jsdom n'a pas. Sous Node (tests de logique et de serveur), rien a faire.
 */
import { vi } from 'vitest';

if (typeof window !== 'undefined') {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  // motion lit `prefers-reduced-motion` une fois pour tout le processus : on repond
  // « oui » avant le premier rendu. Les animations se posent net, les intervalles
  // d'animation (useFrame, count-up) ne tournent pas, les libelles ne bougent pas.
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    }) as MediaQueryList;

  // Le repli video de l'ecran allume : jsdom n'implemente ni play ni pause.
  HTMLMediaElement.prototype.play = () => Promise.resolve();
  HTMLMediaElement.prototype.pause = () => {};

  // jsdom repond `undefined` a confirm(), ce qui annulerait toute suppression.
  vi.spyOn(window, 'confirm').mockReturnValue(true);
}

if (typeof window === 'undefined') {
  // Node 26 avertit a chaque acces a son `localStorage` experimental : les modules du
  // magasin le lisent au chargement. Un stockage en memoire, muet, suffit sous Node.
  const memoire = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => memoire.get(k) ?? null,
      setItem: (k: string, v: string) => void memoire.set(k, String(v)),
      removeItem: (k: string) => void memoire.delete(k),
      clear: () => memoire.clear(),
      get length() {
        return memoire.size;
      },
      key: (i: number) => [...memoire.keys()][i] ?? null,
    },
  });
}
