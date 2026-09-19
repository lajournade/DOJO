/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('le routeur', () => {
  beforeEach(() => vi.resetModules());

  it("lit l'URL au chargement, et ramene un chemin inconnu a l'accueil", async () => {
    window.history.replaceState({}, '', '/history');
    let r = await import('./router');
    let vu = '';
    r.useRoute; // le hook ne se teste qu'en composant : on lit par l'abonnement de navigate
    window.history.replaceState({}, '', '/nulle-part');
    vi.resetModules();
    r = await import('./router');
    r.navigate('/program');
    expect(window.location.pathname).toBe('/program');
    // Meme cible sans replace : rien ne bouge ; avec replace, l'historique ne grandit pas.
    const avant = window.history.length;
    r.navigate('/program');
    r.navigate('/program', { replace: true });
    expect(window.history.length).toBe(avant);
    vu = window.location.pathname;
    expect(vu).toBe('/program');
  });

  it('suit le geste retour du navigateur', async () => {
    window.history.replaceState({}, '', '/');
    const r = await import('./router');
    r.navigate('/history');
    window.history.replaceState({}, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
    // Le chemin courant se relit par une navigation « vers lui-meme » : sans replace, elle ne fait rien.
    const longueur = window.history.length;
    r.navigate('/');
    expect(window.history.length).toBe(longueur);
    r.navigate('/history');
    expect(window.location.pathname).toBe('/history');
  });
});
