/** @vitest-environment jsdom */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { act } from 'react';
import { demarrerServeur, type ServeurDeTest } from '../test/serveur';
import { demarrerAppareil, type Appareil } from '../test/appareil';
import { etat } from '../test/fabrique';
import type { Op } from '../types';

/**
 * ConOps 12 — le VPN tombe en pleine seance : la saisie continue, un compteur
 * « hors ligne N » s'affiche, la file attend dans localStorage, et tout remonte au
 * retour du reseau. Le serveur ignore ce qu'il a deja applique.
 */
describe('perte du reseau et rejeu de la file', () => {
  let serveur: ServeurDeTest;
  let app: Appareil;

  beforeAll(async () => {
    serveur = await demarrerServeur(etat());
    app = await demarrerAppareil(serveur, { localStorage: { 'dojo.user.v1': 'u-1' } });
    await app.attendre('choisis ton combat');
    await app.clic('A');
    await app.clic('fight');
    await app.clicContenant('fight!');
    await app.attendre('impact');
    await app.clicBouton('impact');
    await app.attendreSynchro();
  });

  afterAll(async () => {
    await app.demonter();
    await serveur.fermer();
  });

  let file: Op[] = [];

  it("continue d'enregistrer hors ligne, en le signalant", async () => {
    await serveur.arreter();
    await app.clicBouton('impact');
    await app.clicBouton('2');
    await app.clicBouton('impact');
    await app.attendre('hors ligne 2');
    expect(app.texte()).toContain('Développé couché');
    file = JSON.parse(localStorage.getItem('dojo.queue.v1') ?? '[]') as Op[];
    expect(file.map((o) => o.type)).toEqual(['set.log', 'set.log']);
    expect((await serveur.lireJson()).liveSessions['u-1'].entries).toHaveLength(1);
  });

  it("la file survit a un rechargement de la page", async () => {
    await app.clic('← quitter');
    await app.attendre('choisis ton combat');
    // L'abandon lui-meme rejoint la file : trois operations attendent.
    await app.attendre('hors ligne 3');
    await app.recharger();
    // Serveur injoignable au lancement : l'application s'ouvre quand meme, et la file est intacte.
    expect(app.texte()).not.toContain('chargement');
    expect(JSON.parse(localStorage.getItem('dojo.queue.v1') ?? '[]')).toHaveLength(3);
  });

  it("remonte tout au retour du reseau, dans l'ordre", async () => {
    await serveur.redemarrer();
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    await app.attendre('choisis ton combat');
    await app.attendreSynchro();
    const json = await serveur.lireJson();
    expect(json.liveSessions).toEqual({});
    expect(json.appliedOps.slice(-3).map((id) => file.map((o) => o.opId).includes(id))).toEqual([true, true, false]);
    expect(json.logs).toEqual([]); // abandonnee : rien au journal
  });

  it('le serveur ignore une salve deja appliquee', async () => {
    const res = await fetch('/api/ops', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(file),
    });
    expect(await res.json()).toMatchObject({ applied: 0 });
  });

  it("un bouton relance l'envoi a la main", async () => {
    await serveur.arreter();
    await app.clic('changer');
    await app.attendre('select player');
    await app.clic('+ nouveau joueur');
    await app.saisir('#player-name', 'Zoé');
    await app.clic('entrer');
    await app.attendre('hors ligne 1');
    await serveur.redemarrer();
    await app.clicContenant('hors ligne');
    await app.attendreSynchro();
    expect((await serveur.lireJson()).users.map((u) => u.name)).toEqual(['Ludo', 'Zoé']);
  });
});
