/** @vitest-environment jsdom */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { demarrerServeur, type ServeurDeTest } from '../test/serveur';
import { demarrerAppareil, type Appareil } from '../test/appareil';
import { etat, item, programme, seance } from '../test/fabrique';

/**
 * ConOps 4 — une machine prise n'arrete pas la seance : la carte mene a un autre
 * exercice, l'ordre du plan ne bouge pas, et le combat revient de lui-meme sur ce
 * qu'on a saute. `terminer` clot avec ce qui a ete joue.
 */
describe('machine prise : la carte de la seance', () => {
  let serveur: ServeurDeTest;
  let app: Appareil;

  beforeAll(async () => {
    const p = programme({
      sessions: [seance('A', [item('squat-barre', { sets: 2 }), item('developpe-couche', { sets: 2 }), item('traction', { sets: 2, restSec: 0 })])],
    });
    serveur = await demarrerServeur(etat({ programs: [p] }));
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

  it("montre la seance entiere et saute a l'exercice choisi", async () => {
    await app.clic('carte →');
    await app.attendre('3 restants / 3');
    expect(app.texte()).toContain('en cours');
    expect(app.texte()).toContain('0/2 séries');
    await app.clic('Traction');
    await app.attendre('exo 3/3');
    expect(app.texte()).toContain('série 1/2');
  });

  it("revient sur le premier exercice non termine une fois celui-ci fini", async () => {
    await app.clicBouton('impact');
    await app.attendre('série 2/2');
    await app.clicBouton('2');
    await app.clicBouton('impact');
    await app.attendre('exo 1/3');
    expect(app.texte()).toContain('Squat barre');
    expect(app.texte()).toContain('série 1/2');

    await app.clic('carte →');
    await app.attendre('2 restants / 3');
    const fini = app.racine.querySelector('[aria-label="fini"]');
    expect(fini).not.toBeNull();
    const bouton = fini?.closest('button') as HTMLButtonElement;
    expect(bouton.disabled).toBe(true);
    expect(bouton.textContent).toContain('Traction');
    expect(bouton.textContent).toContain('2/2 séries');
    await app.clic('← retour');
    await app.attendreAbsence('restants');
  });

  it("marque « entame » ce qu'on laisse en route, et y ramene", async () => {
    await app.clicBouton('impact'); // squat 1/2
    await app.attendre('série 2/2');
    await app.clic('passer');
    await app.clic('carte →');
    await app.attendre('restants');
    await app.clic('Développé couché');
    await app.attendre('exo 2/3');
    await app.clic('carte →');
    await app.attendre('restants');
    expect(app.texte()).toContain('entamé');
    expect(app.texte()).toContain('1/2 séries');
    // Un exercice entame reprend a la serie ou on l'avait laisse.
    await app.clic('Squat barre');
    await app.attendre('exo 1/3');
    expect(app.texte()).toContain('série 2/2');
    await app.clic('carte →');
    await app.attendre('restants');
    await app.clic('Développé couché');
    await app.attendre('exo 2/3');
  });

  it('« terminer » clot la seance avec ce qui a ete joue', async () => {
    await app.clicBouton('impact'); // developpe 1/2
    await app.attendre('série 2/2');
    await app.clic('terminer');
    await app.attendre('you win');
    await app.clic('continue');
    await app.attendre('choisis ton combat');
    await app.attendreSynchro();
    const json = await serveur.lireJson();
    expect(json.liveSessions).toEqual({});
    expect(json.logs[0].entries.map((e) => [e.exerciseId, e.setIndex])).toEqual([
      ['traction', 1],
      ['traction', 2],
      ['squat-barre', 1],
      ['developpe-couche', 1],
    ]);
  });
});
