/** @vitest-environment jsdom */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { History } from './History';
import { etat, journal, serie, vue } from '../test/fabrique';
import type { UserView } from '../types';

const store = vi.hoisted(() => ({ state: null as UserView | null }));
vi.mock('../store/state', () => ({ useStore: () => store, dispatch: vi.fn() }));

let container: HTMLDivElement;
let root: Root;
const arrow = (name: string) => container.querySelector<HTMLButtonElement>(`[aria-label="Exercice ${name}"]`)!;
const select = () => container.querySelector<HTMLSelectElement>('#history-exercise')!;
const render = () => act(async () => root.render(<History />));
const click = (button: HTMLElement) => act(async () => button.click());
const choose = (id: string) => act(async () => {
  select().value = id;
  select().dispatchEvent(new Event('change', { bubbles: true }));
});

beforeEach(async () => {
  store.state = vue(etat({ logs: [
    journal({ date: '2026-09-01', series: [serie('squat-barre', 1, 80, 8)] }),
    journal({ date: '2026-09-05', series: [serie('squat-barre', 1, 90, 8), serie('developpe-couche', 1, 40, 10)] }),
    journal({ date: '2026-09-09', series: [serie('squat-barre', 1, 100, 8), serie('developpe-couche', 1, 50, 10), serie('traction', 1, 0, 5)] }),
  ] }));
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await render();
  await click([...container.querySelectorAll('button')].find((b) => b.textContent === 'par exercice')!);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

it('parcourt la liste sans boucler, y compris après une sélection directe', async () => {
  expect(select().value).toBe('squat-barre');
  expect(arrow('précédent').disabled).toBe(true);
  await click(arrow('précédent'));
  expect(select().value).toBe('squat-barre');
  await click(arrow('suivant'));
  expect(select().value).toBe('developpe-couche');
  expect(container.textContent).toContain('10×50kg');
  expect(container.textContent).not.toContain('8×100kg');
  expect(arrow('précédent').disabled).toBe(false);
  expect(arrow('suivant').disabled).toBe(false);
  await click(arrow('suivant'));
  expect(select().value).toBe('traction');
  expect(arrow('suivant').disabled).toBe(true);
  await click(arrow('suivant'));
  expect(select().value).toBe('traction');
  await choose('developpe-couche');
  await click(arrow('précédent'));
  expect(select().value).toBe('squat-barre');
});

it('réinitialise le point actif en passant à une courbe plus courte', async () => {
  const points = container.querySelectorAll('svg[role="img"] rect[fill="transparent"]');
  await act(async () => {
    points[2].dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
  });
  expect(container.querySelector('figcaption')?.textContent).toContain('100 kg');
  await click(arrow('suivant'));
  expect(container.querySelector('figcaption')?.textContent).toContain('2 séances');
  await choose('squat-barre');
  expect(container.querySelector('figcaption')?.textContent).toContain('3 séances');
});

it('revient au premier exercice si la sélection disparaît et gère un historique vide', async () => {
  await choose('traction');
  store.state = { ...store.state!, logs: [journal({ date: '2026-09-01', series: [serie('squat-barre', 1, 80, 8)] })] };
  await render();
  expect(select().value).toBe('squat-barre');
  expect(arrow('précédent').disabled).toBe(true);
  expect(arrow('suivant').disabled).toBe(true);
  expect(container.textContent).toContain('8×80kg');
  store.state = { ...store.state!, logs: [] };
  await render();
  expect(container.textContent).toContain('Aucune série enregistrée.');
  expect(select()).toBeNull();
  expect(arrow('suivant')).toBeNull();
  store.state = { ...store.state!, logs: [journal({ date: '2026-09-01', series: [serie('traction', 1, 0, 5)] })] };
  await render();
  expect(select().value).toBe('traction');
});

it('propose seulement la dernière séance du jour avec plan et bloque si une séance est en cours', async () => {
  const { todayIso } = await import('../store/selectors');
  const { etape, item, seanceEnCours } = await import('../test/fabrique');
  const plan = [etape(item('squat-barre'))];
  const older = { ...journal({ id: 'older', date: todayIso(), startedAt: '2026-09-28T08:00:00Z', series: [] }), plan };
  const latest = { ...older, id: 'latest', startedAt: '2026-09-28T10:00:00Z' };
  store.state = { ...store.state!, logs: [older, latest] };
  await click([...container.querySelectorAll('button')].find((b) => b.textContent === 'journal')!);
  await render();
  const buttons = () => [...container.querySelectorAll('button')].filter((b) => b.textContent === 'Reprendre la séance');
  expect(buttons()).toHaveLength(1);
  expect(buttons()[0].disabled).toBe(false);
  store.state = { ...store.state!, liveSession: seanceEnCours({ plan }) };
  await render();
  expect(buttons()[0].disabled).toBe(true);
  expect(container.textContent).toContain('Une séance est déjà en cours.');
  store.state = { ...store.state!, liveSession: null, logs: [older, { ...latest, plan: undefined }] };
  await render();
  expect(buttons()).toHaveLength(0);
  store.state = { ...store.state!, logs: [{ ...latest, date: '2000-01-01' }] };
  await render();
  expect(buttons()).toHaveLength(0);
});
