/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { demarrerServeur, type ServeurDeTest } from '../test/serveur';
import { demarrerAppareil, type Appareil } from '../test/appareil';
import { etat, joueur, journal, serie } from '../test/fabrique';

let serveur: ServeurDeTest;
let app: Appareil;
afterEach(async () => { await app?.demonter(); await serveur?.fermer(); });

async function boot() {
  serveur = await demarrerServeur(etat({ programs: [],
    users: [joueur({ activeProgramId: null }), joueur({ id: 'u-2', name: 'Lisa', palette: 1 })],
    logs: [journal({ date: '2026-09-10', series: [serie('dips', 1, 10, 8), serie('dips', 2, 20, 12, 3)] })],
  }));
  app = await demarrerAppareil(serveur, { localStorage: { 'dojo.user.v1': 'u-1' } });
  await app.attendre('Séance libre');
  await app.clic('Séance libre');
}
async function add(name: string, first = false) {
  if (!first) await app.clic('Ajouter un exercice');
  const input = first ? 'input[list="exercices"]' : 'input[list="exercices-carte"]';
  await app.saisir(input, name);
  await app.touche(input, 'Enter');
  await app.attendre('valider la série');
}

describe('séance libre', () => {
  it('reste ouverte, reprend les valeurs, revient sur les exercices et exporte le journal', async () => {
    await boot();
    await app.recharger();
    await app.attendre('Ajoutez votre premier exercice');
    await add('Dips', true);
    expect(app.texte()).toContain('rir — facultatif');
    expect(app.texte()).not.toContain('cible');
    await app.clicBouton('3');
    await app.clic('valider la série');
    await app.attendre('série 2');
    await app.clic('valider la série');
    await add('Curl libre');
    await app.clic('valider la série');
    await app.clic('annuler la dernière');
    await app.clic('valider la série');
    await app.clic('carte →');
    await app.clic('Dips');
    await app.attendre('série 3');
    await app.clic('valider la série');
    await add('Dips'); // reprend, sans doublon
    await app.attendre('série 4');
    await app.attendreSynchro();
    const live = (await serveur.lireJson()).liveSessions['u-1'];
    expect(live.plan.map((s) => s.sets)).toEqual([3, 1]);
    expect(live.entries.map((s) => [s.weight, s.reps, s.rir])).toEqual([
      [20, 12, 3], [20, 12, null], [0, 8, null], [20, 12, null],
    ]);
    await app.cliquer('[aria-label="changer de joueur"]');
    await app.attendre('choisis ton combat');
    await app.clic('Séance libre');
    await add('Dips', true);
    await app.clic('valider la série');
    await app.attendreSynchro();
    expect((await serveur.lireJson()).liveSessions['u-2'].entries[0]).toMatchObject({ weight: 0, reps: 8 });
    await app.clic('terminer');
    await app.clic('continue');
    await app.cliquer('[aria-label="changer de joueur"]');
    await app.recharger();
    await app.attendre('série 4');
    await app.clic('terminer');
    await app.attendre('you win');
    expect(app.texte()).not.toContain('% de volume');
    await app.attendreSynchro();
    const json = await serveur.lireJson();
    expect(json.logs.at(-1)).toMatchObject({ mode: 'free', programCode: 'LIBRE', sessionId: null });
    expect(json.users[0].activeProgramId).toBeNull();
    expect(json.programs).toEqual([]);
    expect(json.liveSessions).toEqual({});
    expect(await (await fetch('/api/export.csv')).text()).toContain('LIBRE');
  });

  it('ferme une séance vide sans afficher un ancien résultat', async () => {
    await boot();
    await app.clic('terminer');
    await app.attendre('choisis ton combat');
    await app.attendreSynchro();
    expect((await serveur.lireJson()).logs).toHaveLength(1);
    expect((await serveur.lireJson()).liveSessions).toEqual({});
  });

  it('reprend une séance existante et synchronise les séries hors ligne sans doublon', async () => {
    await boot();
    await app.clic('← accueil');
    await app.clic('Séance libre');
    await add('Dips', true);
    await app.attendreSynchro();
    const id = (await serveur.lireJson()).liveSessions['u-1'].id;
    await serveur.arreter();
    await app.clic('valider la série');
    await app.clic('valider la série');
    await app.attendre('hors ligne 2');
    const queue = localStorage.getItem('dojo.queue.v1')!;
    await serveur.redemarrer();
    await act(async () => { window.dispatchEvent(new Event('online')); });
    await app.attendreSynchro();
    await fetch('/api/ops', { method: 'POST', headers: { 'content-type': 'application/json' }, body: queue });
    const json = await serveur.lireJson();
    expect(json.liveSessions['u-1']).toMatchObject({ id, cursor: { planIndex: 0, setIndex: 3 } });
    expect(json.liveSessions['u-1'].entries).toHaveLength(2);
    expect(json.liveSessions['u-1'].plan[0].sets).toBe(2);
    expect(json.liveSessions['u-2']).toBeUndefined();
  });
});
