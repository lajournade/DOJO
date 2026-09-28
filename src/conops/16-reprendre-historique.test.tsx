/** @vitest-environment jsdom */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { demarrerServeur, type ServeurDeTest } from '../test/serveur';
import { demarrerAppareil, type Appareil } from '../test/appareil';
import { etape, etat, item, journal, serie } from '../test/fabrique';
import { todayIso } from '../store/selectors';

describe('compléter la dernière séance du jour depuis le journal', () => {
  let serveur: ServeurDeTest;
  let app: Appareil;
  const plan = [etape(item('squat-barre', { sets: 1 }))];
  const log = {
    ...journal({ date: todayIso(), series: [{ ...serie('squat-barre', 1, 60, 8), itemId: plan[0].id }],
      startedAt: new Date().toISOString(), endedAt: new Date().toISOString() }),
    plan,
  };

  beforeAll(async () => {
    serveur = await demarrerServeur(etat({ logs: [log] }));
    app = await demarrerAppareil(serveur, { url: '/history', localStorage: { 'dojo.user.v1': 'u-1' } });
  });
  afterAll(async () => {
    await app.demonter();
    await serveur.fermer();
  });

  it('rouvre une séance complète et reste ouverte après rechargement', async () => {
    await app.attendre('Reprendre la séance');
    await app.clic('Reprendre la séance');
    await app.attendre('Compléter la séance');
    await app.attendreSynchro();
    await app.recharger();
    await app.attendre('Compléter la séance');
    expect((await serveur.lireJson()).logs).toHaveLength(1);
  });

  it('ajoute une série sans rejouer celles déjà enregistrées', async () => {
    await app.clic('+ série · Squat barre');
    await app.attendre('série 2/2');
    await app.clicBouton('impact');
    await app.attendre('Compléter la séance');
    await app.attendreSynchro();
    const state = await serveur.lireJson();
    expect(state.liveSessions['u-1'].entries).toHaveLength(2);
    expect(state.logs[0].entries).toHaveLength(1);
    expect(state.logs[0].plan![0].sets).toBe(1);
  });

  it('ajoute un exercice puis clôture en remplaçant le journal', async () => {
    await app.clic('+ exercice');
    await app.saisir('input[list="exercices"]', 'Dips');
    await app.clic('✓');
    await app.attendre('Dips');
    await app.clicBouton('impact');
    await app.clic('terminer');
    await app.attendre('you win');
    await app.attendreSynchro();
    const state = await serveur.lireJson();
    expect(state.liveSessions).toEqual({});
    expect(state.logs).toHaveLength(1);
    expect(state.logs[0]).toMatchObject({ id: log.id, startedAt: log.startedAt });
    expect(state.logs[0].entries).toHaveLength(3);
    expect(state.logs[0].plan).toHaveLength(2);
  });

  it('reprend une séance partielle et abandonne sans perdre le journal précédent', async () => {
    window.history.replaceState({}, '', '/history');
    await app.recharger();
    await app.attendre('Reprendre la séance');
    await app.clic('Reprendre la séance');
    await app.attendre('série 2/3');
    expect(app.texte()).toContain('Dips');
    await app.clic('← quitter');
    await app.attendre('choisis ton combat');
    await app.attendreSynchro();
    const state = await serveur.lireJson();
    expect(state.liveSessions).toEqual({});
    expect(state.logs[0].entries).toHaveLength(3);
  });
});
