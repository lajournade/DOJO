/**
 * Un « appareil » : jsdom, son localStorage, et l'application montee dedans,
 * branchee sur un serveur de test. Les gestes sont ceux du pouce — cliquer un
 * libelle, saisir un champ, appuyer longtemps — et chaque geste attend que React
 * ait fini de rendre.
 *
 * Les modules de `src/` sont recharges a chaque montage (`vi.resetModules`) : le
 * routeur lit l'URL et le magasin lit le profil au chargement, comme au demarrage
 * d'une vraie page. React et motion, eux, viennent de node_modules et restent uniques.
 */
import { vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ServeurDeTest } from './serveur';

export interface Appareil {
  racine: HTMLElement;
  texte(): string;
  /** L'element le plus profond dont le texte, sans espaces autour, est exactement `texte`. */
  element(texte: string): HTMLElement;
  clic(texte: string): Promise<void>;
  /** Le `<button>` dont le texte entier est exactement `texte` — quand un chiffre s'affiche aussi ailleurs. */
  clicBouton(texte: string): Promise<void>;
  /** Comme `clic`, sur le premier element (le plus profond) dont le texte contient `texte`. */
  clicContenant(texte: string): Promise<void>;
  cliquer(selecteur: string): Promise<void>;
  /** Saisie dans un `input` ou `textarea`, comme React 19 l'ecoute. `index` : le n-ieme element du selecteur. */
  saisir(selecteur: string, valeur: string, index?: number): Promise<void>;
  /** Le n-ieme `<button>` dont le texte entier est `texte`. */
  clicNieme(texte: string, index: number): Promise<void>;
  /** Le n-ieme champ (`input` ou `textarea`) porte par un `<label>` dont le libelle est `label`. */
  champ(label: string, index?: number): HTMLInputElement | HTMLTextAreaElement;
  saisirChamp(label: string, valeur: string, index?: number): Promise<void>;
  /** Choix dans un `<select>`. */
  choisir(selecteur: string, valeur: string): Promise<void>;
  /** Un cran sur un bouton a repetition (BigStepper) : pointerdown puis pointerup. */
  appuyer(ariaLabel: string): Promise<void>;
  /** L'appui long de `useHold` : pointerdown, 650 ms, pointerup. */
  appuyerLong(texte: string): Promise<void>;
  /** Touche clavier sur un element. */
  touche(selecteur: string, key: string): Promise<void>;
  attendre(cible: string | (() => boolean), delai?: number): Promise<void>;
  attendreAbsence(texte: string, delai?: number): Promise<void>;
  /** La file d'envoi videe : ce qui a ete fait est sur le serveur. */
  attendreSynchro(): Promise<void>;
  /** Rechargement de la page : memes localStorage et URL, modules neufs. */
  recharger(): Promise<void>;
  /** Change de telephone : un autre localStorage, le meme serveur. */
  basculerAppareil(nom: string): Promise<void>;
  demonter(): Promise<void>;
}

const fetchReel = globalThis.fetch;

const NOM_APPAREIL = '__appareil__';

function plusProfond(racine: HTMLElement, accepte: (t: string) => boolean): HTMLElement | null {
  const tous = Array.from(racine.querySelectorAll<HTMLElement>('*')).filter((el) =>
    accepte(el.textContent ?? ''),
  );
  // Le dernier candidat sans candidat parmi ses descendants est le plus profond.
  return tous.find((el) => !tous.some((autre) => autre !== el && el.contains(autre))) ?? null;
}

/** Ecrit une valeur comme le ferait le clavier : React 19 ignore un simple `el.value =`. */
function ecrire(el: HTMLElement, valeur: string, evenement: 'input' | 'change') {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  setter?.call(el, valeur);
  el.dispatchEvent(new Event(evenement, { bubbles: true }));
}

const pointer = (type: string) => {
  const Ev = (window as Window & { PointerEvent?: typeof MouseEvent }).PointerEvent ?? MouseEvent;
  return new Ev(type, { bubbles: true, cancelable: true });
};

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function demarrerAppareil(
  serveur: ServeurDeTest,
  options: { url?: string; localStorage?: Record<string, string> } = {},
): Promise<Appareil> {
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
    fetchReel(new URL(String(input), serveur.base), init),
  );
  if (options.localStorage) {
    localStorage.clear();
    for (const [k, v] of Object.entries(options.localStorage)) localStorage.setItem(k, v);
  }
  window.history.replaceState({}, '', options.url ?? '/');

  const racine = document.createElement('div');
  document.body.append(racine);
  let root: Root | null = null;

  async function monter() {
    vi.resetModules();
    const { App } = await import('../App');
    await act(async () => {
      root = createRoot(racine);
      root.render(createElement(App));
    });
    await attendre(() => !texte().includes('chargement'));
  }

  async function demonterRacine() {
    if (root) await act(async () => root?.unmount());
    root = null;
  }

  const texte = () => racine.textContent ?? '';

  function element(t: string): HTMLElement {
    const el = plusProfond(racine, (s) => s.trim() === t);
    if (!el) throw new Error(`introuvable : « ${t} »\n---\n${texte()}`);
    return el;
  }

  async function agir(fn: () => void) {
    await act(async () => {
      fn();
      await pause(0);
    });
  }

  async function attendre(cible: string | (() => boolean), delai = 4000) {
    const fin = Date.now() + delai;
    const ok = typeof cible === 'string' ? () => texte().includes(cible) : cible;
    while (!ok()) {
      if (Date.now() > fin) throw new Error(`attendu : ${String(cible)}\n---\n${texte()}`);
      await act(async () => {
        await pause(20);
      });
    }
  }

  const appareil: Appareil = {
    racine,
    texte,
    element,
    attendre,
    clic: (t) => agir(() => element(t).click()),
    clicBouton(t) {
      const el = Array.from(racine.querySelectorAll<HTMLButtonElement>('button')).find(
        (b) => (b.textContent ?? '').trim() === t,
      );
      if (!el) throw new Error(`bouton introuvable : « ${t} »\n---\n${texte()}`);
      return agir(() => el.click());
    },
    clicContenant(t) {
      const el = plusProfond(racine, (s) => s.includes(t));
      if (!el) throw new Error(`introuvable : « ${t} »\n---\n${texte()}`);
      return agir(() => el.click());
    },
    cliquer(selecteur) {
      const el = racine.querySelector<HTMLElement>(selecteur);
      if (!el) throw new Error(`introuvable : ${selecteur}`);
      return agir(() => el.click());
    },
    saisir(selecteur, valeur, index = 0) {
      const el = racine.querySelectorAll<HTMLElement>(selecteur)[index];
      if (!el) throw new Error(`introuvable : ${selecteur} #${index}`);
      return agir(() => ecrire(el, valeur, 'input'));
    },
    clicNieme(t, index) {
      const el = Array.from(racine.querySelectorAll<HTMLButtonElement>('button')).filter(
        (b) => (b.textContent ?? '').trim() === t,
      )[index];
      if (!el) throw new Error(`bouton introuvable : « ${t} » #${index}\n---\n${texte()}`);
      return agir(() => el.click());
    },
    champ(label, index = 0) {
      const labels = Array.from(racine.querySelectorAll('label')).filter(
        (l) => (l.querySelector('span')?.textContent ?? '').trim() === label,
      );
      const el = labels[index]?.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
      if (!el) throw new Error(`champ introuvable : « ${label} » #${index}`);
      return el;
    },
    saisirChamp(label, valeur, index = 0) {
      const el = appareil.champ(label, index);
      return agir(() => ecrire(el, valeur, 'input'));
    },
    choisir(selecteur, valeur) {
      const el = racine.querySelector<HTMLElement>(selecteur);
      if (!el) throw new Error(`introuvable : ${selecteur}`);
      return agir(() => ecrire(el, valeur, 'change'));
    },
    appuyer(ariaLabel) {
      const el = racine.querySelector<HTMLElement>(`[aria-label="${ariaLabel}"]`);
      if (!el) throw new Error(`introuvable : [aria-label="${ariaLabel}"]`);
      return agir(() => {
        el.dispatchEvent(pointer('pointerdown'));
        el.dispatchEvent(pointer('pointerup'));
      });
    },
    async appuyerLong(t) {
      const el = element(t);
      await agir(() => el.dispatchEvent(pointer('pointerdown')));
      await act(async () => {
        await pause(700);
      });
      await agir(() => el.dispatchEvent(pointer('pointerup')));
    },
    touche(selecteur, key) {
      const el = racine.querySelector<HTMLElement>(selecteur);
      if (!el) throw new Error(`introuvable : ${selecteur}`);
      return agir(() => el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
    },
    attendreAbsence: (t, delai) => attendre(() => !texte().includes(t), delai),
    attendreSynchro: () =>
      attendre(() => {
        const file = localStorage.getItem('dojo.queue.v1');
        return (!file || file === '[]') && !texte().includes('sync') && !texte().includes('hors ligne');
      }),
    async recharger() {
      await demonterRacine();
      await monter();
    },
    async basculerAppareil(nom) {
      const courant = localStorage.getItem(NOM_APPAREIL) ?? 'A';
      const stockes = JSON.parse(sessionStorage.getItem('appareils') ?? '{}') as Record<string, Record<string, string>>;
      stockes[courant] = { ...localStorage };
      delete stockes[courant][NOM_APPAREIL];
      sessionStorage.setItem('appareils', JSON.stringify(stockes));
      await demonterRacine();
      localStorage.clear();
      for (const [k, v] of Object.entries(stockes[nom] ?? {})) localStorage.setItem(k, v);
      localStorage.setItem(NOM_APPAREIL, nom);
      window.history.replaceState({}, '', '/');
      await monter();
    },
    async demonter() {
      await demonterRacine();
      vi.unstubAllGlobals();
      racine.remove();
    },
  };

  await monter();
  return appareil;
}
