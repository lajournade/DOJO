/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BigStepper } from './BigStepper';
import { FightIntro } from './FightIntro';
import { HealthBar, RoundClock, useElapsed } from './HealthBar';
import { comboLabel } from './ComboMeter';

/**
 * Les composants a horloge, sous horloges factices : l'acceleration du compteur,
 * l'intro VS, le chrono de la seance. L'integration les traverse en temps reel, mais
 * ne peut pas attendre une seconde d'appui a chaque fois.
 */
let racine: HTMLElement;
let root: Root;

const rendre = async (el: ReactElement) => {
  await act(async () => root.render(el));
};
const pointer = (type: string) => new (window.PointerEvent ?? MouseEvent)(type, { bubbles: true, cancelable: true });
const bouton = (label: string) => racine.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`) as HTMLButtonElement;

beforeEach(() => {
  vi.useFakeTimers();
  racine = document.createElement('div');
  document.body.append(racine);
  root = createRoot(racine);
});

afterEach(async () => {
  await act(async () => root.unmount());
  racine.remove();
  vi.useRealTimers();
});

describe('BigStepper', () => {
  it("avance d'un pas a l'appui, puis accelere, puis par quatre", async () => {
    const onChange = vi.fn();
    let valeur = 60;
    const props = { label: 'charge', unit: 'kg', step: 2.5, onChange: (v: number) => { valeur = v; onChange(v); } };
    await rendre(createElement(BigStepper, { ...props, value: valeur }));
    expect(racine.textContent).toContain('60kg');

    await act(async () => bouton('augmenter').dispatchEvent(pointer('pointerdown')));
    expect(onChange).toHaveBeenLastCalledWith(62.5);
    await rendre(createElement(BigStepper, { ...props, value: valeur }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(420 + 110 * 3);
    });
    expect(onChange).toHaveBeenCalledTimes(4);
    // Le composant lit toujours la derniere valeur rendue : sans re-rendu, il repart de 62,5.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(110 * 8);
    });
    const dernier = onChange.mock.calls.at(-1)?.[0] as number;
    expect(dernier).toBe(62.5 + 2.5 * 4); // le onzieme tick avance de quatre pas
    await act(async () => bouton('augmenter').dispatchEvent(pointer('pointerup')));
    const apres = onChange.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(onChange).toHaveBeenCalledTimes(apres);
  });

  it('borne la valeur et se saisit au clavier, virgule comprise', async () => {
    const onChange = vi.fn();
    await rendre(createElement(BigStepper, { label: 'reps', unit: 'reps', value: 0, step: 1, min: 0, max: 3, decimals: 0, hint: 'cible 8', onChange }));
    expect(racine.textContent).toContain('cible 8');
    await act(async () => bouton('diminuer').dispatchEvent(pointer('pointerdown')));
    expect(onChange).toHaveBeenLastCalledWith(0);
    await act(async () => bouton('diminuer').dispatchEvent(pointer('pointerleave')));

    await act(async () => racine.querySelector('button:not([aria-label])')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    const input = racine.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('0');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, '2,7');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(onChange).toHaveBeenLastCalledWith(3);
    expect(racine.querySelector('input')).toBeNull();

    // Une saisie qui n'est pas un nombre ne change rien, et le blur referme aussi.
    await act(async () => racine.querySelector('button:not([aria-label])')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    const input2 = racine.querySelector('input') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input2, 'abc');
      input2.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const avant = onChange.mock.calls.length;
    await act(async () => input2.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    expect(onChange).toHaveBeenCalledTimes(avant);
    expect(racine.querySelector('input')).toBeNull();
  });

  it('formate la valeur avec une virgule et sans zeros inutiles', async () => {
    await rendre(createElement(BigStepper, { label: 'charge', unit: 'kg', value: 102.5, step: 2.5, tone: 'impact', onChange: () => {} }));
    expect(racine.textContent).toContain('102,5');
    await rendre(createElement(BigStepper, { label: 'charge', unit: 'kg', value: 100, step: 2.5, onChange: () => {} }));
    expect(racine.textContent).toContain('100kg');
  });
});

describe('FightIntro', () => {
  it('avec le VS : deux temps, puis la sortie une seule fois', async () => {
    const onDone = vi.fn();
    await rendre(createElement(FightIntro, { code: 'A', name: 'Séance A', onDone }));
    expect(racine.textContent).toContain('vs');
    expect(racine.textContent).not.toContain('fight!');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(750);
    });
    expect(racine.textContent).toContain('fight!');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    // Un appui apres coup ne ressort pas une deuxieme fois.
    await act(async () => racine.firstElementChild?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("sans le VS : direct sur « fight! », et l'appui coupe court au minuteur", async () => {
    const onDone = vi.fn();
    await rendre(createElement(FightIntro, { code: 'A', name: 'Séance A', withVs: false, onDone }));
    expect(racine.textContent).toContain('fight!');
    await act(async () => racine.firstElementChild?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onDone).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe('HealthBar et RoundClock', () => {
  it('change de couleur en descendant, et le chrono affiche minutes et secondes', async () => {
    await rendre(createElement(HealthBar, { name: 'exo', total: 10, done: 0, side: 'left', flash: 0 }));
    const html = () => racine.innerHTML;
    const vert = html();
    await rendre(createElement(HealthBar, { name: 'exo', total: 10, done: 6, side: 'right', flash: 1 }));
    const orange = html();
    await rendre(createElement(HealthBar, { name: 'exo', total: 10, done: 9, side: 'right', flash: 2 }));
    const rouge = html();
    expect(new Set([vert, orange, rouge]).size).toBe(3);
    await rendre(createElement(HealthBar, { name: 'exo', total: 0, done: 0, side: 'left', flash: 0 }));

    await rendre(createElement(RoundClock, { seconds: 303 }));
    expect(racine.textContent).toContain('05:03');
    expect(racine.textContent).toContain('temps');
    // Au-dela de l'heure, les minutes continuent de compter plutot que de boucler.
    await rendre(createElement(RoundClock, { seconds: 100 * 60 + 9 }));
    expect(racine.textContent).toContain('100:09');
  });

  it("le chrono de seance compte depuis l'horodatage de depart, seconde par seconde", async () => {
    function Chrono({ startedAt }: { startedAt: string | null }) {
      return createElement(RoundClock, { seconds: useElapsed(startedAt) });
    }
    vi.setSystemTime(new Date('2026-09-18T10:05:03Z'));
    await rendre(createElement(Chrono, { startedAt: '2026-09-18T10:00:00Z' }));
    expect(racine.textContent).toContain('05:03');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(57_000);
    });
    expect(racine.textContent).toContain('06:00');
    // Sans seance, la boite reste a zero et ne tourne pas.
    await rendre(createElement(Chrono, { startedAt: null }));
    expect(racine.textContent).toContain('00:00');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(racine.textContent).toContain('00:00');
  });

  it('nomme les combos', () => {
    expect([1, 2, 5, 8].map(comboLabel)).toEqual([null, 'good', 'great', 'perfect']);
  });
});
