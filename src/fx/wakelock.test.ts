/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe("l'ecran allume", () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '';
  });

  it("prend le verrou d'ecran quand le navigateur l'offre, et le rend", async () => {
    const sentinel = { release: vi.fn(async () => {}), addEventListener: vi.fn() };
    const request = vi.fn(async () => sentinel);
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
    const { keepAwake, releaseAwake } = await import('./wakelock');
    await keepAwake();
    expect(request).toHaveBeenCalledWith('screen');
    expect(document.querySelector('video')).toBeNull();
    // Le systeme relache le verrou : on l'apprend par l'evenement.
    const [, onRelease] = sentinel.addEventListener.mock.calls[0] as [string, () => void];
    onRelease();
    releaseAwake();
    releaseAwake(); // sans verrou, sans effet
    expect(sentinel.release).not.toHaveBeenCalled();
    delete (navigator as unknown as { wakeLock?: unknown }).wakeLock;
  });

  it('retombe sur la video muette quand le verrou est refuse, et une seule video', async () => {
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request: vi.fn(async () => Promise.reject(new Error('contexte non securise'))) },
    });
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValueOnce(new Error('geste requis')).mockResolvedValue();
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause');
    const { keepAwake, releaseAwake, rearmOnVisible } = await import('./wakelock');
    await keepAwake();
    await keepAwake();
    const videos = document.querySelectorAll('video');
    expect(videos).toHaveLength(1);
    expect(videos[0].muted).toBe(true);
    expect(videos[0].loop).toBe(true);
    expect(play).toHaveBeenCalledTimes(2);

    // Retour au premier plan : on relance ; en arriere-plan, rien.
    const stop = rearmOnVisible();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(play).toHaveBeenCalledTimes(2);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(play).toHaveBeenCalledTimes(3));
    stop();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(play).toHaveBeenCalledTimes(3);

    releaseAwake();
    expect(pause).toHaveBeenCalled();
    delete (navigator as unknown as { wakeLock?: unknown }).wakeLock;
    play.mockRestore();
    pause.mockRestore();
  });

  it("rend un verrou pris, meme si le rendu echoue", async () => {
    const sentinel = { release: vi.fn(async () => Promise.reject(new Error('deja rendu'))), addEventListener: vi.fn() };
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: vi.fn(async () => sentinel) } });
    const { keepAwake, releaseAwake } = await import('./wakelock');
    await keepAwake();
    releaseAwake();
    expect(sentinel.release).toHaveBeenCalled();
    delete (navigator as unknown as { wakeLock?: unknown }).wakeLock;
  });
});
