/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Op } from '../types';
import { etat } from '../test/fabrique';

/**
 * La synchronisation, avec un `fetch` simule et des horloges factices : ce que
 * l'integration ne peut pas attendre — le recul exponentiel jusqu'a 30 s, la
 * balise de fin de page, le garde contre deux envois a la fois.
 */
const op = (id: string): Op => ({ opId: id, type: 'log.remove', payload: { logId: 'x' } });
const reponse = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body });

async function charger() {
  vi.resetModules();
  const state = await import('./state');
  const sync = await import('./sync');
  const { queue } = await import('./queue');
  return { ...state, ...sync, queue };
}

describe('flush et pull', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("envoie la file en une salve, la vide, et repasse en idle", async () => {
    const fetch = vi.fn(async () => reponse({ rev: 1, applied: 2 }));
    vi.stubGlobal('fetch', fetch);
    const { flush, queue, getSnapshot } = await charger();
    queue.push(op('a'));
    queue.push(op('b'));
    expect(await flush()).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/ops');
    expect(JSON.parse(init.body as string).map((o: Op) => o.opId)).toEqual(['a', 'b']);
    expect(queue.size).toBe(0);
    expect(getSnapshot().status).toBe('idle');
    // Rien a envoyer : idle sans requete.
    expect(await flush()).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("ne lance pas deux envois a la fois, et renvoie ce qui s'est ajoute pendant l'envoi", async () => {
    let liberer: (v: unknown) => void = () => {};
    const fetch = vi
      .fn()
      .mockImplementationOnce(() => new Promise((r) => (liberer = r)))
      .mockResolvedValue(reponse({}));
    vi.stubGlobal('fetch', fetch);
    const { flush, queue, getSnapshot } = await charger();
    queue.push(op('a'));
    const premier = flush();
    expect(getSnapshot().status).toBe('syncing');
    expect(await flush()).toBe(false); // garde : un envoi est en cours
    queue.push(op('b'));
    liberer(reponse({}));
    expect(await premier).toBe(true);
    await vi.runAllTimersAsync();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(queue.size).toBe(0);
  });

  it('recule de 2 s a 30 s tant que le serveur ne repond pas, puis repart', async () => {
    const fetch = vi.fn(async () => reponse({}, false));
    vi.stubGlobal('fetch', fetch);
    const { flush, queue, getSnapshot } = await charger();
    queue.push(op('a'));
    expect(await flush()).toBe(false);
    expect(getSnapshot().status).toBe('offline');
    expect(getSnapshot().pending).toBe(1);
    // 2 s, 4 s, 8 s, 16 s, 30 s, 30 s...
    for (const delai of [2_000, 4_000, 8_000, 16_000, 30_000, 30_000]) {
      const avant = fetch.mock.calls.length;
      await vi.advanceTimersByTimeAsync(delai - 1);
      expect(fetch.mock.calls.length).toBe(avant);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetch.mock.calls.length).toBe(avant + 1);
    }
    fetch.mockImplementation(async () => reponse({}));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(queue.size).toBe(0);
    expect(getSnapshot().status).toBe('idle');
  });

  it("pull rejoue la file locale par-dessus l'etat serveur", async () => {
    const serveur = etat();
    vi.stubGlobal('fetch', vi.fn(async () => reponse(serveur)));
    const { pull, queue, getSnapshot } = await charger();
    queue.push({ opId: 'z', type: 'exercise.upsert', payload: { exercise: { id: 'dips', name: 'Dips' } } });
    expect(await pull()).toBe(true);
    expect(getSnapshot().loaded).toBe(true);
    expect(getSnapshot().status).toBe('syncing');
    expect(getSnapshot().state.exercises.some((e) => e.id === 'dips')).toBe(true);
    expect(serveur.exercises.some((e) => e.id === 'dips')).toBe(true); // applique en place
  });

  it("pull signale un serveur muet ou en erreur", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reponse({}, false)));
    const { pull, getSnapshot } = await charger();
    expect(await pull()).toBe(false);
    expect(getSnapshot().status).toBe('offline');
    expect(getSnapshot().loaded).toBe(false);
  });

  it('boot pousse puis tire ; sans serveur, il ouvre quand meme et reessaie tout', async () => {
    const fetch = vi.fn<() => Promise<unknown>>(async () => Promise.reject(new Error('reseau')));
    vi.stubGlobal('fetch', fetch);
    const { boot, getSnapshot } = await charger();
    await boot();
    expect(getSnapshot().loaded).toBe(true);
    expect(getSnapshot().status).toBe('offline');
    fetch.mockImplementation(async () => reponse(etat()));
    await vi.advanceTimersByTimeAsync(2_000);
    await vi.runOnlyPendingTimersAsync();
    expect(getSnapshot().status).toBe('idle');
    expect(getSnapshot().users).toHaveLength(1);
  });
});

describe('le demon', () => {
  let stop: () => void = () => {};
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    stop();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("regroupe une rafale de mutations en un seul envoi", async () => {
    const fetch = vi.fn(async () => reponse({}));
    vi.stubGlobal('fetch', fetch);
    const { startSyncDaemon, dispatch, queue } = await charger();
    stop = startSyncDaemon();
    dispatch('log.remove', { logId: 'a' });
    dispatch('log.remove', { logId: 'b' });
    expect(queue.size).toBe(2);
    await vi.advanceTimersByTimeAsync(249);
    expect(fetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(queue.size).toBe(0);
  });

  it("au reveil, envoie la file puis relit l'etat ; onglet cache, rien", async () => {
    const fetch = vi.fn(async (url: string) => reponse(url === '/api/state' ? etat() : {}));
    vi.stubGlobal('fetch', fetch);
    const { startSyncDaemon, queue } = await charger();
    stop = startSyncDaemon();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(fetch).not.toHaveBeenCalled();

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    window.dispatchEvent(new Event('online'));
    await vi.runAllTimersAsync();
    expect(fetch.mock.calls.map((c) => c[0])).toEqual(['/api/state']);

    queue.push(op('a'));
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.runAllTimersAsync();
    expect(fetch.mock.calls.map((c) => c[0])).toEqual(['/api/state', '/api/ops', '/api/state']);

    // Debranche, le demon ne repond plus a rien.
    stop();
    window.dispatchEvent(new Event('online'));
    await vi.runAllTimersAsync();
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("depose la file en balise quand la page se cache, s'il y a de quoi", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reponse({})));
    const sendBeacon = vi.fn(() => true);
    Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: sendBeacon });
    const { startSyncDaemon, queue } = await charger();
    stop = startSyncDaemon();
    window.dispatchEvent(new Event('pagehide'));
    expect(sendBeacon).not.toHaveBeenCalled();
    queue.push(op('a'));
    window.dispatchEvent(new Event('pagehide'));
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const [url, blob] = sendBeacon.mock.calls[0] as unknown as [string, Blob];
    expect(url).toBe('/api/ops');
    expect(blob.type).toBe('application/json');
    delete (navigator as unknown as { sendBeacon?: unknown }).sendBeacon;
  });
});
