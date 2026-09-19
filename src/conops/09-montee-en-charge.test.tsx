/** @vitest-environment jsdom */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { demarrerServeur, type ServeurDeTest } from '../test/serveur';
import { demarrerAppareil, type Appareil } from '../test/appareil';
import { etat, historiqueMontee } from '../test/fabrique';

/**
 * ConOps 9 — la montee en charge. Le RIR de la derniere serie fixe la charge
 * proposee la fois suivante : +2,5 kg quand la fourchette est pleine, une rep de
 * plus sinon, a l'identique sous la cible. Le briefing l'annonce, l'arene la sert,
 * et un appui sur le compteur suffit a revenir dessus.
 */
describe('la montee en charge', () => {
  let serveur: ServeurDeTest;
  let app: Appareil;

  beforeAll(async () => {
    const logs = historiqueMontee();
    // Une seance plus ancienne, plus lourde sur le squat, pour verifier que seule la derniere compte.
    serveur = await demarrerServeur(etat({ logs }));
    app = await demarrerAppareil(serveur, { localStorage: { 'dojo.user.v1': 'u-1' } });
    await app.attendre('choisis ton combat');
  });

  afterAll(async () => {
    await app.demonter();
    await serveur.fermer();
  });

  it("le briefing annonce les montees, le poids de depart et la rampe", async () => {
    await app.clic('A');
    await app.attendre('fight');
    expect(app.texte()).toContain('2montées');
    expect(app.texte()).toContain('+2,5 kg');
    expect(app.texte()).toContain('60 à 102,5 kg');
    expect(app.texte()).toContain('+1 rep');
    expect(app.texte()).toContain('50 kg');
  });

  it("l'arene sert la meme proposition, avec le power up a la serie de travail", async () => {
    await app.clic('fight');
    await app.clicContenant('fight!');
    await app.attendre('impact');
    // L'echauffement garde ses valeurs, sans annonce.
    expect(app.texte()).not.toContain('power up');
    await app.clicBouton('impact');
    await app.clic('passer');
    await app.clicBouton('impact');
    await app.attendre('série 3/3');
    await app.clic('passer');
    expect(app.texte()).toContain('power up');
    expect(app.texte()).toContain('rir 2 ≥ cible 2 · 12 reps atteintes');
    expect(app.texte()).toContain('102,5');
    expect(app.texte()).toContain('8'); // reps ramenees en bas de fourchette
  });

  it("toucher le compteur efface la proposition, qui n'est jamais imposee", async () => {
    await app.appuyer('diminuer');
    expect(app.texte()).toContain('100');
    expect(app.texte()).not.toContain('power up');
    expect(app.texte()).not.toContain('montée +2,5 kg');
    await app.clicBouton('1');
    await app.clicBouton('impact');
    await app.attendre('Développé couché');
  });

  it("une rep de plus quand la fourchette n'est pas remplie, et la trace sur les series suivantes", async () => {
    expect(app.texte()).toContain('power up');
    expect(app.texte()).toContain('+1 rep');
    expect(app.texte()).toContain('encore une rep avant la charge');
    await app.clic('passer');
    await app.clicBouton('impact');
    await app.attendre('série 2/3');
    expect(app.texte()).not.toContain('power up');
    expect(app.texte()).toContain('montée +1 rep');
    await app.clic('terminer');
    await app.attendre('you win');
    await app.attendreSynchro();
    const log = (await serveur.lireJson()).logs.at(-1);
    expect(log?.entries.map((e) => [e.weight, e.reps, e.rir])).toEqual([
      [60, 8, null],
      [80, 8, null],
      [100, 8, 1], // la montee refusee d'un appui, et un RIR sous la cible
      [50, 11, null],
    ]);
  });

  it("sous la cible de RIR, la fois suivante repart a l'identique, sans un mot", async () => {
    await app.clic('continue');
    await app.attendre('choisis ton combat');
    await app.clic('A');
    await app.attendre('fight');
    expect(app.texte()).toContain('0montée');
    expect(app.texte()).not.toContain('+2,5 kg');
    expect(app.texte()).toContain('60 à 100 kg');
    await app.clic('← retour');
  });
});
