/** @vitest-environment jsdom */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { demarrerServeur, type ServeurDeTest } from '../test/serveur';
import { demarrerAppareil, type Appareil } from '../test/appareil';
import { etat, joueur } from '../test/fabrique';

/**
 * ConOps 1 — le premier lancement. L'ecran d'accueil est un « select player » :
 * on cree son profil, l'appareil s'en souvient, et l'on peut en changer.
 */
describe('premier lancement et choix du joueur', () => {
  let serveur: ServeurDeTest;
  let app: Appareil;

  beforeAll(async () => {
    serveur = await demarrerServeur(etat({ users: [joueur({ id: 'u-lisa', name: 'Lisa', palette: 1 })] }));
    app = await demarrerAppareil(serveur, { localStorage: {} });
  });

  afterAll(async () => {
    await app.demonter();
    await serveur.fermer();
  });

  it("propose le choix du joueur tant qu'aucun profil n'est retenu", async () => {
    await app.attendre('select player');
    expect(app.texte()).toContain('Lisa');
    expect(app.texte()).toContain('+ nouveau joueur');
  });

  it('cree un joueur et arrive sur le dojo', async () => {
    await app.clic('+ nouveau joueur');
    await app.saisir('#player-name', 'Ludo');
    await app.clic('entrer');
    await app.attendre('choisis ton combat');
    expect(app.texte()).toContain('Ludo');
    expect(app.texte()).toContain('Programme test');

    await app.attendreSynchro();
    const json = await serveur.lireJson();
    expect(json.users.map((u) => u.name)).toEqual(['Lisa', 'Ludo']);
    expect(json.users[1].palette).toBe(1);
    expect(localStorage.getItem('dojo.user.v1')).toBe(json.users[1].id);
  });

  it("retient le profil sur l'appareil : au rechargement, le dojo s'ouvre directement", async () => {
    await app.recharger();
    await app.attendre('choisis ton combat');
    expect(app.texte()).toContain('Ludo');
    expect(app.texte()).not.toContain('select player');
  });

  it('change de joueur depuis le dojo', async () => {
    await app.clic('changer');
    await app.attendre('select player');
    expect(app.texte()).toContain('en jeu');
    await app.clic('Lisa');
    await app.attendre('choisis ton combat');
    expect(app.texte()).toContain('Lisa');
    expect(localStorage.getItem('dojo.user.v1')).toBe('u-lisa');
  });

  it('ignore une touche Entree sur un nom vide et annule la saisie', async () => {
    await app.clic('changer');
    await app.attendre('+ nouveau joueur');
    await app.clic('+ nouveau joueur');
    await app.touche('#player-name', 'Enter');
    expect(app.texte()).toContain('annuler');
    await app.clic('annuler');
    expect(app.texte()).toContain('+ nouveau joueur');
  });

  it("supprime un joueur par appui long, et l'appareil redemande un profil", async () => {
    await app.appuyerLong('Ludo');
    await app.attendre(() => !app.texte().includes('Ludo'));
    await app.attendreSynchro();
    expect((await serveur.lireJson()).users.map((u) => u.name)).toEqual(['Lisa']);

    // Supprimer le joueur en jeu renvoie a la selection meme apres rechargement.
    await app.clic('Lisa');
    await app.attendre('choisis ton combat');
    await app.clic('changer');
    await app.attendre('select player');
    await app.appuyerLong('Lisa');
    await app.attendre(() => !app.texte().includes('Lisa'));
    expect(localStorage.getItem('dojo.user.v1')).toBeNull();
    await app.recharger();
    expect(app.texte()).toContain('select player');
  });
});
