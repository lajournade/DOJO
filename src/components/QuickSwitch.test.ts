/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { joueur } from '../test/fabrique';
import { nextUserId } from './QuickSwitch';

/** Le relais d'un joueur a l'autre : le suivant dans l'ordre, en boucle. */
describe('nextUserId', () => {
  const ludo = joueur();
  const marie = joueur({ id: 'u-2', name: 'Marie' });
  const paul = joueur({ id: 'u-3', name: 'Paul' });

  it("a deux, c'est l'autre", () => {
    expect(nextUserId([ludo, marie], 'u-1')).toBe('u-2');
    expect(nextUserId([ludo, marie], 'u-2')).toBe('u-1');
  });

  it('a trois, on tourne', () => {
    expect(nextUserId([ludo, marie, paul], 'u-3')).toBe('u-1');
  });

  it("seul, personne d'autre", () => {
    expect(nextUserId([ludo], 'u-1')).toBeNull();
    expect(nextUserId([], null)).toBeNull();
  });

  it('un courant inconnu mene au premier', () => {
    expect(nextUserId([ludo, marie], null)).toBe('u-1');
  });
});
