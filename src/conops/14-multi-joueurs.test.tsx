/** @vitest-environment jsdom */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { demarrerServeur, type ServeurDeTest } from '../test/serveur';
import { demarrerAppareil, type Appareil } from '../test/appareil';
import { etat } from '../test/fabrique';

/**
 * ConOps 14 — plusieurs joueurs, plusieurs telephones. Le profil est retenu par
 * l'appareil, pas par le serveur ; chacun garde son journal et sa seance en cours,
 * et deux seances menees en parallele ne se croisent jamais. La bibliotheque de
 * programmes, elle, est commune.
 */
describe('deux joueurs, deux appareils', () => {
  let serveur: ServeurDeTest;
  let app: Appareil;

  beforeAll(async () => {
    serveur = await demarrerServeur(etat({ users: [] }));
    app = await demarrerAppareil(serveur, { localStorage: {} });
  });

  afterAll(async () => {
    await app.demonter();
    await serveur.fermer();
  });

  it("l'appareil A : Ludo commence une seance", async () => {
    await app.attendre('select player');
    await app.clic('+ nouveau joueur');
    await app.saisir('#player-name', 'Ludo');
    await app.clic('entrer');
    await app.attendre('choisis ton combat');
    await app.clic('A');
    await app.clic('fight');
    await app.clicContenant('fight!');
    await app.attendre('impact');
    await app.clicBouton('impact');
    await app.attendreSynchro();
  });

  it("l'appareil B : Marie se cree, prend le meme programme, et ne voit rien de Ludo", async () => {
    await app.basculerAppareil('B');
    await app.attendre('select player');
    expect(app.texte()).toContain('Ludo'); // les joueurs sont sur le serveur
    expect(app.texte()).not.toContain('en jeu'); // mais cet appareil n'en a choisi aucun
    await app.clic('+ nouveau joueur');
    await app.saisir('#player-name', 'Marie');
    await app.clic('entrer');
    await app.attendre('choisis ton combat');
    expect(app.texte()).toContain('Programme test'); // la bibliotheque est partagee
    expect(app.texte()).not.toContain('continue ?'); // la seance de Ludo n'est pas la sienne
    expect(app.texte()).toContain('jamais joué');

    await app.clic('A');
    await app.clic('fight');
    await app.clicContenant('fight!');
    await app.attendre('impact');
    expect(app.texte()).toContain('série 1/3'); // pas la serie 2 de Ludo
    await app.clicBouton('impact');
    await app.clic('passer');
    await app.clicBouton('impact');
    await app.attendreSynchro();
    const json = await serveur.lireJson();
    const [ludo, marie] = json.users;
    expect([ludo.name, marie.name]).toEqual(['Ludo', 'Marie']);
    expect(json.liveSessions[ludo.id].entries).toHaveLength(1);
    expect(json.liveSessions[marie.id].entries).toHaveLength(2);
  });

  it("retour sur A : Ludo reprend exactement ou il en etait", async () => {
    await app.basculerAppareil('A');
    await app.attendre('continue ?');
    expect(app.texte()).toContain('Ludo');
    expect(app.texte()).toContain('1 série en cours');
    await app.clic('continue ?');
    await app.attendre('impact');
    expect(app.texte()).toContain('série 2/3');
    await app.clic('terminer');
    await app.attendre('you win');
    await app.attendreSynchro();
    const json = await serveur.lireJson();
    const [ludo, marie] = json.users;
    expect(Object.keys(json.liveSessions)).toEqual([marie.id]);
    expect(json.logs.map((l) => l.userId)).toEqual([ludo.id]);
  });

  it('un changement de joueur sur un appareil change le regard, pas les donnees', async () => {
    await app.clic('continue');
    await app.attendre('choisis ton combat');
    await app.clic('changer');
    await app.attendre('select player');
    await app.clic('Marie');
    await app.attendre('continue ?');
    expect(app.texte()).toContain('2 séries en cours');
    await app.clic('historique');
    await app.attendre('Aucune séance enregistrée.');
  });
});
