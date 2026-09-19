/** @vitest-environment jsdom */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { demarrerServeur, type ServeurDeTest } from '../test/serveur';
import { demarrerAppareil, type Appareil } from '../test/appareil';
import { etat, journal, programme, serie } from '../test/fabrique';

/**
 * ConOps 6 — un exercice de plus se glisse en fin de seance depuis la carte, et
 * l'arene y va tout de suite ; ce qu'on quittait reste entame et revient a son
 * tour. Le rab entre au journal, le programme n'en sait rien.
 */
describe('ajouter un exercice depuis la carte', () => {
  let serveur: ServeurDeTest;
  let app: Appareil;

  beforeAll(async () => {
    const dips = journal({ date: '2026-09-10', series: [serie('dips', 1, 10, 8), serie('dips', 2, 10, 8, 2)] });
    serveur = await demarrerServeur(etat({ programs: [programme({ goal: 'force' })], logs: [dips] }));
    app = await demarrerAppareil(serveur, { localStorage: { 'dojo.user.v1': 'u-1' } });
    await app.attendre('choisis ton combat');
    await app.clic('A');
    await app.clic('fight');
    await app.clicContenant('fight!');
    await app.attendre('impact');
    await app.clicBouton('impact'); // le squat est entame
    await app.attendre('série 2/3');
  });

  afterAll(async () => {
    await app.demonter();
    await serveur.fermer();
  });

  it("un exercice connu arrive avec ses series et sa charge, et l'arene y va", async () => {
    await app.clic('carte →');
    await app.attendre('restants');
    await app.clic('exercice');
    await app.saisir('input[list="exercices-carte"]', 'dips');
    await app.touche('input[list="exercices-carte"]', 'Enter');
    await app.attendre('exo 3/3');
    expect(app.texte()).toContain('Dips');
    expect(app.texte()).toContain('série 1/2');
    expect(app.texte()).toContain('10'); // la charge de la derniere fois
    await app.attendreSynchro();
    const json = await serveur.lireJson();
    expect(json.liveSessions['u-1'].plan.map((s) => s.exerciseId)).toEqual(['squat-barre', 'developpe-couche', 'dips']);
    expect(json.liveSessions['u-1'].cursor).toEqual({ planIndex: 2, setIndex: 1 });
    expect(json.programs[0].sessions[0].items).toHaveLength(2);
  });

  it("un inconnu prend les valeurs de la famille du programme et entre au catalogue", async () => {
    await app.clic('carte →');
    await app.attendre('restants');
    expect(app.texte()).toContain('entamé'); // le squat, laisse a sa deuxieme serie
    await app.clic('exercice');
    await app.saisir('input[list="exercices-carte"]', 'Soulevé de terre');
    await app.clic('✓');
    await app.attendre('exo 4/4');
    expect(app.texte()).toContain('Soulevé de terre');
    expect(app.texte()).toContain('3–5 reps'); // la famille force
    await app.attendreSynchro();
    const json = await serveur.lireJson();
    expect(json.exercises.map((e) => e.id)).toContain('souleve-de-terre');
    expect(json.liveSessions['u-1'].plan[3]).toMatchObject({ exerciseId: 'souleve-de-terre', sets: 3, repMin: 3, repMax: 5 });
  });

  it("ferme la cellule sans rien ajouter sur un nom vide", async () => {
    await app.clic('carte →');
    await app.attendre('restants');
    await app.clic('exercice');
    await app.clic('✓');
    expect(app.texte()).toContain('restants');
    expect(app.racine.querySelector('input[list="exercices-carte"]')).toBeNull();
    await app.clic('← retour');
  });

  it("le rab entre au journal comme le reste, puis le combat revient sur ce qui restait", async () => {
    await app.clicBouton('impact');
    await app.attendre('série 2/3');
    await app.clicBouton('impact');
    await app.clicBouton('impact');
    // Le souleve de terre fini : retour au squat, laisse a sa deuxieme serie.
    await app.attendre('exo 1/4');
    expect(app.texte()).toContain('Squat barre');
    expect(app.texte()).toContain('série 2/3');
    await app.clic('terminer');
    await app.attendre('you win');
    await app.attendreSynchro();
    const log = (await serveur.lireJson()).logs.at(-1);
    expect(log?.entries.map((e) => e.exerciseId)).toEqual(['squat-barre', 'souleve-de-terre', 'souleve-de-terre', 'souleve-de-terre']);
  });
});
