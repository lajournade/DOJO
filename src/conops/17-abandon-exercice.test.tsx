/** @vitest-environment jsdom */
import { afterEach, expect, it } from 'vitest';
import { act } from 'react';
import { demarrerServeur, type ServeurDeTest } from '../test/serveur';
import { demarrerAppareil, type Appareil } from '../test/appareil';
import { etat, etape, item, seanceEnCours, serie } from '../test/fabrique';

let serveur: ServeurDeTest;
let app: Appareil;
afterEach(async () => { await app?.demonter(); await serveur?.fermer(); });

async function boot(free = false) {
  const plan = [etape(item('squat-barre')), ...(!free ? [etape(item('dips'))] : [])];
  const live = seanceEnCours({ plan,
    entries: [{ ...serie('squat-barre', 1, 60, 8), itemId: plan[0].id }],
    cursor: { planIndex: 0, setIndex: 2 },
  });
  if (free) live.mode = 'free';
  serveur = await demarrerServeur(etat({ liveSessions: { 'u-1': live } }));
  app = await demarrerAppareil(serveur, { url: '/arena', localStorage: { 'dojo.user.v1': 'u-1' } });
  await app.attendre('série 2');
}
async function zero() {
  await app.clicBouton('8reps');
  await app.saisir('input[inputmode="decimal"]', '0');
  await app.touche('input[inputmode="decimal"]', 'Enter');
  await app.clic('Abandonner l’exercice');
}

it('abandonne hors ligne, annule, recharge et termine avec un bilan distinct', async () => {
  await boot();
  await app.attendreSynchro();
  await serveur.arreter();
  await zero();
  await app.attendre('Dips');
  await app.clic('carte →');
  expect(app.texte()).toContain('abandonné');
  expect(app.texte()).toContain('1/3 séries');
  await app.clic('← retour');
  await app.clic('annuler la dernière');
  await app.attendre('Squat barre');
  await zero();
  await serveur.redemarrer();
  await act(async () => { window.dispatchEvent(new Event('online')); });
  await app.attendreSynchro();
  await app.recharger();
  await app.attendre('Dips');
  await zero();
  await app.attendre('you win');
  expect(app.texte()).toContain('exercices abandonnés');
  await app.attendreSynchro();
  const log = (await serveur.lireJson()).logs.at(-1)!;
  expect(log.entries.map((e) => e.reps)).toEqual([8, 0, 0]);
});

it('permet d’annuler ou de continuer après un abandon en séance libre', async () => {
  await boot(true);
  await zero();
  await app.attendre('Choisissez ou ajoutez');
  expect(app.texte()).toContain('Squat barre · abandonné');
  await app.recharger();
  await app.attendre('Choisissez ou ajoutez');
  await app.clic('annuler la dernière');
  await app.attendre('série 2');
  await zero();
  await app.saisir('input[list="exercices"]', 'Dips');
  await app.touche('input[list="exercices"]', 'Enter');
  await app.attendre('valider la série');
  await app.clic('valider la série');
  await app.clic('terminer');
  await app.attendre('you win');
  await app.attendreSynchro();
  expect((await serveur.lireJson()).logs.at(-1)?.entries.map((e) => e.reps)).toEqual([8, 0, 8]);
});
