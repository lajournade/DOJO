/** @vitest-environment jsdom */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { demarrerServeur, type ServeurDeTest } from '../test/serveur';
import { demarrerAppareil, type Appareil } from '../test/appareil';
import { etat, joueur } from '../test/fabrique';

/**
 * ConOps 8 — la bibliotheque de programmes : creer dans une famille, qui
 * pre-remplit les exercices, composer une seance, la choisir comme programme en
 * cours, dupliquer, supprimer.
 */
describe('la bibliotheque de programmes', () => {
  let serveur: ServeurDeTest;
  let app: Appareil;

  beforeAll(async () => {
    serveur = await demarrerServeur(etat({ programs: [], users: [joueur({ activeProgramId: null })] }));
    app = await demarrerAppareil(serveur, { localStorage: { 'dojo.user.v1': 'u-1' } });
  });

  afterAll(async () => {
    await app.demonter();
    await serveur.fermer();
  });

  it("sans programme, le dojo renvoie a l'ecran Programme", async () => {
    await app.attendre('aucun programme');
    expect(app.texte()).toContain("Lancez une séance libre ou créez un programme");
    await app.clic('programme');
    await app.attendre('La bibliothèque est vide');
  });

  it('cree un programme dans une famille et le decrit', async () => {
    await app.clic('+ hypertrophie');
    await app.attendre('nom du programme');
    expect(app.champ('nom du programme').value).toBe('Nouveau programme');
    expect(app.champ('code').value).toBe('P1');
    expect(app.texte()).toContain('8–12 reps · rir 2');

    await app.saisirChamp('nom du programme', 'Push pull');
    await app.saisirChamp('code', 'pp');
    expect(app.champ('code').value).toBe('PP');
    await app.clic('force');
    await app.attendre('3–5 reps · rir 2');
    await app.clic('hypertrophie');
    await app.attendre('8–12 reps');
  });

  it("compose une seance : les exercices, leurs valeurs, l'ordre", async () => {
    await app.clic('+ ajouter une séance');
    await app.attendre('nom de la séance');
    expect(app.champ('nom de la séance').value).toBe('Séance A');
    const noms = () => Array.from(app.racine.querySelectorAll<HTMLInputElement>('input[list="exercices"]')).map((n) => n.value);
    expect(noms()).toHaveLength(1);
    expect(app.champ('séries').value).toBe('3');
    expect(app.champ('rep max').value).toBe('12');

    await app.saisirChamp('nom de la séance', 'Poussée');
    await app.saisir('input[list="exercices"]', 'Squat barre');
    await app.clic('+ ajouter un exercice');
    await app.clic('+ ajouter un exercice');
    await app.attendre(() => noms().length === 3);
    // Un inconnu, avec ses propres valeurs et un conseil ; puis un connu.
    await app.saisir('input[list="exercices"]', 'Curl marteau', 1);
    await app.saisirChamp('séries', '4', 1);
    await app.saisirChamp('rep min', '6', 1);
    await app.saisirChamp('rir max', '3', 1);
    await app.saisir('textarea', 'coude fixe', 1);
    await app.saisir('input[list="exercices"]', 'Dips', 2);

    // Les dips remontent d'un cran ; le premier rang, lui, ne bouge pas.
    await app.clicNieme('↑', 2);
    expect(noms()).toEqual(['Squat barre', 'Dips', 'Curl marteau']);
    await app.clicNieme('↑', 0);
    await app.clicNieme('↓', 2);
    expect(noms()).toEqual(['Squat barre', 'Dips', 'Curl marteau']);

    await app.clic('enregistrer');
    await app.attendre('3 exercices');
    expect(app.texte()).toContain('Poussée');
    await app.attendreSynchro();
    const json = await serveur.lireJson();
    expect(json.exercises.map((e) => e.id)).toContain('curl-marteau');
    const items = json.programs[0].sessions[0].items;
    expect(items.map((i) => i.exerciseId)).toEqual(['squat-barre', 'dips', 'curl-marteau']);
    expect(items[2]).toMatchObject({ sets: 4, repMin: 6, targetRirMax: 3, notes: 'coude fixe' });
  });

  it("le choisit comme programme en cours : le dojo l'affiche", async () => {
    await app.clic('choisir ce programme');
    await app.attendreAbsence('choisir ce programme');
    await app.clic('← programmes');
    await app.attendre('en cours');
    expect(app.texte()).toContain('1 séance · 3 exercices');
    await app.clic('← dojo');
    await app.attendre('choisis ton combat');
    expect(app.texte()).toContain('Push pull');
    expect(app.texte()).toContain('3 ex · 10 sér');
    await app.attendreSynchro();
    expect((await serveur.lireJson()).users[0].activeProgramId).toBe((await serveur.lireJson()).programs[0].id);
  });

  it('duplique un programme, supprime une seance, supprime un programme', async () => {
    await app.clic('programme');
    await app.attendre('créer un programme');
    await app.clic('PP');
    await app.attendre('nom du programme');
    await app.clic('dupliquer ce programme');
    await app.attendre(() => app.champ('nom du programme').value === 'Push pull (copie)');
    expect(app.champ('code').value).toBe('P1');

    await app.clic('A');
    await app.attendre('nom de la séance');
    await app.clic('supprimer la séance');
    await app.attendre(() => !app.texte().includes('3 exercices'));

    await app.clic('← programmes');
    await app.attendre('0 exercices');
    await app.appuyerLong('P1');
    await app.attendreAbsence('(copie)');
    await app.attendreSynchro();
    const json = await serveur.lireJson();
    expect(json.programs.map((p) => p.code)).toEqual(['PP']);
    expect(app.texte()).toContain('appui long sur un programme pour le supprimer');
  });

  it("retirer un exercice de l'editeur, et une ligne sans nom ne s'enregistre pas", async () => {
    await app.clic('PP');
    await app.clic('A');
    await app.attendre('nom de la séance');
    await app.clicNieme('✕', 2);
    expect(app.racine.querySelectorAll('input[list="exercices"]')).toHaveLength(2);
    await app.clic('+ ajouter un exercice');
    await app.clic('enregistrer');
    await app.attendre('2 exercices');
    await app.attendreSynchro();
    expect((await serveur.lireJson()).programs[0].sessions[0].items.map((i) => i.exerciseId)).toEqual(['squat-barre', 'dips']);
  });
});
