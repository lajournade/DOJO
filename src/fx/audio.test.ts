/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Une fausse Web Audio : chaque noeud note ce qu'on lui demande, rien ne sonne. */
function fausseAudio() {
  const noeud = () => {
    const n: Record<string, unknown> = {
      connect: vi.fn(() => n),
      start: vi.fn(),
      stop: vi.fn(),
      frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), value: 0 },
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), value: 0 },
      type: '',
      buffer: null,
    };
    return n;
  };
  const ctx = {
    state: 'suspended',
    currentTime: 0,
    sampleRate: 8000,
    destination: {},
    resume: vi.fn(async () => {
      ctx.state = 'running';
    }),
    createOscillator: vi.fn(noeud),
    createGain: vi.fn(noeud),
    createBufferSource: vi.fn(noeud),
    createBiquadFilter: vi.fn(noeud),
    createBuffer: vi.fn((_c: number, frames: number) => ({ getChannelData: () => new Float32Array(frames) })),
  };
  return ctx;
}

describe('le son', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it('est muet au premier lancement, et ne cree aucun contexte tant qu\'il le reste', async () => {
    const ctor = vi.fn();
    vi.stubGlobal('AudioContext', ctor);
    const { isMuted, sfx, unlock } = await import('./audio');
    expect(isMuted()).toBe(true);
    await unlock();
    sfx.hit();
    sfx.select();
    expect(ctor).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("s'active d'un appui, se souvient du reglage, et joue chaque effet", async () => {
    const ctx = fausseAudio();
    const ctor = vi.fn(function () {
      return ctx;
    });
    (window as unknown as { AudioContext: unknown }).AudioContext = ctor;
    const { isMuted, sfx, toggleMute } = await import('./audio');
    expect(toggleMute()).toBe(false);
    expect(isMuted()).toBe(false);
    expect(localStorage.getItem('dojo.muted.v1')).toBe('off');
    await Promise.resolve();
    expect(ctor).toHaveBeenCalledTimes(1);
    expect(ctx.resume).toHaveBeenCalled();

    sfx.hit(1);
    sfx.select();
    sfx.vs();
    sfx.fight();
    sfx.win();
    sfx.ko();
    sfx.bell();
    sfx.powerup();
    sfx.warn();
    sfx.combo(2);
    expect(ctx.createOscillator.mock.calls.length).toBeGreaterThan(15);
    expect(ctx.createBufferSource).toHaveBeenCalledTimes(2); // hit et ko ont une percussion
    expect(ctor).toHaveBeenCalledTimes(1); // un seul contexte pour toute la session

    expect(toggleMute()).toBe(true);
    expect(localStorage.getItem('dojo.muted.v1')).toBe('on');
    const avant = ctx.createOscillator.mock.calls.length;
    sfx.hit();
    expect(ctx.createOscillator.mock.calls.length).toBe(avant);
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
  });

  it('retombe sur webkitAudioContext, et relit le reglage au lancement', async () => {
    localStorage.setItem('dojo.muted.v1', 'off');
    const ctx = fausseAudio();
    (window as unknown as { webkitAudioContext: unknown }).webkitAudioContext = vi.fn(function () {
      return ctx;
    });
    const { isMuted, sfx } = await import('./audio');
    expect(isMuted()).toBe(false);
    sfx.select();
    await Promise.resolve();
    expect(ctx.createOscillator).toHaveBeenCalled();
    delete (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext;
  });
});
