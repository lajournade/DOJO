/** @vitest-environment jsdom */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { demarrerServeur, type ServeurDeTest } from '../test/serveur';
import { demarrerAppareil, type Appareil } from '../test/appareil';
import { etat } from '../test/fabrique';

/**
 * ConOps 7 — deux exercices voisins s'enchainent en superset : un bouton entre les
 * deux lignes de l'editeur, la lettre se pose seule, le repos du premier tombe a
 * zero. L'arene alterne alors leurs series, et le repos ne tombe qu'a la sortie.
 */
describe('le superset', () => {
  let serveur: ServeurDeTest;
  let app: Appareil;

  beforeAll(async () => {
    serveur = await demarrerServeur(etat());
    app = await demarrerAppareil(serveur, { localStorage: { 'dojo.user.v1': 'u-1' } });
    await app.attendre('choisis ton combat');
  });

  afterAll(async () => {
    await app.demonter();
    await serveur.fermer();
  });

  it("se lie et se delie dans l'editeur, le repos suivant le lien", async () => {
    await app.clic('programme');
    await app.attendre('créer un programme');
    await app.clic('P1');
    await app.attendre('nom du programme');
    await app.clic('A');
    await app.attendre('nom de la séance');
    expect(app.champ('repos s', 0).value).toBe('90');

    await app.clic('⛓ enchaîner sans repos');
    await app.attendre('⛓ superset A');
    expect(app.champ('repos s', 0).value).toBe('0');
    expect(app.champ('repos s', 1).value).toBe('90');

    await app.clic('⛓ superset A');
    await app.attendre('⛓ enchaîner sans repos');
    expect(app.champ('repos s', 0).value).toBe('90');

    await app.clic('⛓ enchaîner sans repos');
    await app.attendre('⛓ superset A');
    await app.clic('enregistrer');
    await app.attendre('nom du programme');
    await app.attendreSynchro();
    const items = (await serveur.lireJson()).programs[0].sessions[0].items;
    expect(items.map((i) => [i.supersetGroup, i.restSec])).toEqual([['A', 0], ['A', 90]]);
  });

  it("s'annonce au briefing et alterne les series dans l'arene, sans repos intermediaire", async () => {
    await app.clic('← programmes');
    await app.clic('← dojo');
    await app.attendre('choisis ton combat');
    await app.clic('A');
    await app.attendre('fight');
    expect(app.texte()).toContain('superset A');
    await app.clic('fight');
    await app.clicContenant('fight!');
    await app.attendre('impact');
    expect(app.texte()).toContain('superset A');
    expect(app.texte()).toContain('puis Développé couché');

    await app.clicBouton('impact');
    await app.attendre('exo 2/2');
    expect(app.texte()).not.toContain('repos');
    expect(app.texte()).toContain('série 1/3');

    await app.clicBouton('impact');
    await app.attendre('repos'); // le repos tombe a la sortie de la paire
    expect(app.texte()).toContain('exo 1/2');
    expect(app.texte()).toContain('série 2/3');
    await app.clic('passer');
  });

  it('« + serie » ajoute une serie a toute la paire, « annuler la derniere » revient sur le partenaire', async () => {
    await app.clic('+ série');
    await app.attendre('série 2/4');
    await app.attendreSynchro();
    expect((await serveur.lireJson()).liveSessions['u-1'].plan.map((s) => s.sets)).toEqual([4, 4]);

    await app.clic('annuler la dernière');
    await app.attendre('exo 2/2');
    expect(app.texte()).toContain('série 1/4');
    await app.attendreSynchro();
    expect((await serveur.lireJson()).liveSessions['u-1'].entries).toHaveLength(1);
  });

  it("la derniere serie de la seance n'est pas forcement celle du dernier exercice", async () => {
    // Quatre rondes : A1 A2 A1 A2 A1 A2 A1 A2. Il reste 7 series, la derniere sur le developpe.
    for (let i = 0; i < 6; i += 1) {
      await app.clicBouton('impact');
      if (app.texte().includes('passer')) await app.clic('passer');
    }
    await app.attendre('finish him');
    expect(app.texte()).toContain('Développé couché');
    await app.clicBouton('finish him');
    await app.attendre('you win');
  });
});
