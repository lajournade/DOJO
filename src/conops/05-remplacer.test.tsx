/** @vitest-environment jsdom */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { demarrerServeur, type ServeurDeTest } from '../test/serveur';
import { demarrerAppareil, type Appareil } from '../test/appareil';
import { etat, journal, serie } from '../test/fabrique';

/**
 * ConOps 5 — la machine ne se liberera pas : `remplacer` met un autre exercice a
 * la place, pour cette seance seulement. Un nom nouveau entre au catalogue et garde
 * le compteur ; un exercice connu ramene ses series et sa charge de l'historique.
 */
describe("remplacer un exercice en cours de seance", () => {
  let serveur: ServeurDeTest;
  let app: Appareil;

  beforeAll(async () => {
    const presse = journal({
      date: '2026-09-10',
      programCode: 'P1-B',
      sessionId: 'ses-b',
      series: [1, 2, 3, 4].map((i) => serie('presse-a-cuisses', i, 120, 10, i === 4 ? 2 : null)),
    });
    serveur = await demarrerServeur(etat({ logs: [presse] }));
    app = await demarrerAppareil(serveur, { localStorage: { 'dojo.user.v1': 'u-1' } });
    await app.attendre('choisis ton combat');
    await app.clic('A');
    await app.clic('fight');
    await app.clicContenant('fight!');
    await app.attendre('impact');
  });

  afterAll(async () => {
    await app.demonter();
    await serveur.fermer();
  });

  it("un nom vide ou l'echappement annule, le titre reste un titre", async () => {
    await app.clic('remplacer');
    expect(app.racine.querySelector('input[list="exercices"]')).not.toBeNull();
    await app.touche('input[list="exercices"]', 'Enter');
    expect(app.racine.querySelector('input[list="exercices"]')).toBeNull();
    await app.clic('remplacer');
    await app.touche('input[list="exercices"]', 'Escape');
    expect(app.racine.querySelector('input[list="exercices"]')).toBeNull();
    await app.clic('remplacer');
    await app.clic('✕');
    expect(app.texte()).toContain('Squat barre');
  });

  it('un nom nouveau garde le compteur et entre au catalogue', async () => {
    await app.appuyer('augmenter'); // 0 → 2,5 kg : le compteur porte une valeur a garder
    await app.clic('remplacer');
    await app.saisir('input[list="exercices"]', 'Curl biceps');
    await app.clic('✓');
    await app.attendre('Curl biceps');
    expect(app.texte()).toContain('série 1/3');
    expect(app.texte()).toContain('2,5');
    await app.attendreSynchro();
    const json = await serveur.lireJson();
    expect(json.exercises.map((e) => e.id)).toContain('curl-biceps');
    expect(json.liveSessions['u-1'].plan[0]).toMatchObject({ exerciseId: 'curl-biceps', sets: 3, carry: { weight: 2.5, reps: 8 } });
    // Le programme n'en sait rien.
    expect(json.programs[0].sessions[0].items[0].exerciseId).toBe('squat-barre');
  });

  it("un exercice connu ramene ses series et sa charge de l'historique", async () => {
    await app.clic('remplacer');
    await app.saisir('input[list="exercices"]', 'presse a cuisses');
    await app.touche('input[list="exercices"]', 'Enter');
    await app.attendre('Presse à cuisses');
    expect(app.texte()).toContain('série 1/4');
    expect(app.texte()).toContain('120');
    expect(app.texte()).toContain('record 120 kg');
    await app.attendreSynchro();
    const json = await serveur.lireJson();
    expect(json.exercises.filter((e) => e.id === 'presse-a-cuisses')).toHaveLength(1);
    expect(json.liveSessions['u-1'].plan[0]).toMatchObject({ exerciseId: 'presse-a-cuisses', sets: 4 });
  });

  it('remplacer par le meme exercice ne change rien', async () => {
    await app.clic('remplacer');
    await app.saisir('input[list="exercices"]', 'Presse à cuisses');
    await app.clic('✓');
    expect(app.texte()).toContain('série 1/4');
    await app.clicBouton('impact');
    await app.attendre('série 2/4');
    await app.attendreSynchro();
    expect((await serveur.lireJson()).liveSessions['u-1'].entries[0]).toMatchObject({ exerciseId: 'presse-a-cuisses', weight: 120 });
  });
});
