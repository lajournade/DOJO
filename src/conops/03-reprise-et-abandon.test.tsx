/** @vitest-environment jsdom */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { demarrerServeur, type ServeurDeTest } from '../test/serveur';
import { demarrerAppareil, type Appareil } from '../test/appareil';
import { etape, etat, programme, seanceEnCours, serie } from '../test/fabrique';

/**
 * ConOps 3 — une seance laissee en route se reprend la ou on l'avait laissee,
 * et s'abandonne d'un geste confirme. L'arene sans seance renvoie au dojo.
 */
describe('reprendre et abandonner une seance', () => {
  let serveur: ServeurDeTest;
  let app: Appareil;

  beforeAll(async () => {
    const p = programme();
    const plan = p.sessions[0].items.map(etape);
    const live = seanceEnCours({
      plan,
      entries: [
        { ...serie('squat-barre', 1, 60, 8), itemId: plan[0].id },
        { ...serie('squat-barre', 2, 80, 8), itemId: plan[0].id },
      ],
      cursor: { planIndex: 0, setIndex: 3 },
    });
    serveur = await demarrerServeur(etat({ programs: [p], liveSessions: { 'u-1': live } }));
    app = await demarrerAppareil(serveur, { localStorage: { 'dojo.user.v1': 'u-1' } });
  });

  afterAll(async () => {
    await app.demonter();
    await serveur.fermer();
  });

  it('propose de continuer, et reprend au curseur exact', async () => {
    await app.attendre('continue ?');
    expect(app.texte()).toContain('P1-A · 2 séries en cours');
    await app.clic('continue ?');
    await app.attendre('impact');
    expect(app.texte()).toContain('Squat barre');
    expect(app.texte()).toContain('série 3/3');
    expect(app.texte()).toContain('rir — dernière série');
    expect(app.texte()).toContain('80'); // ce qui vient d'etre porte aujourd'hui
  });

  it("survit a un rechargement de la page en pleine seance", async () => {
    await app.recharger();
    await app.attendre('impact');
    expect(app.texte()).toContain('série 3/3');
  });

  it("abandonne la seance apres confirmation : rien n'entre au journal", async () => {
    await app.clic('← quitter');
    await app.attendre('choisis ton combat');
    expect(app.texte()).not.toContain('continue ?');
    await app.attendreSynchro();
    const json = await serveur.lireJson();
    expect(json.liveSessions).toEqual({});
    expect(json.logs).toEqual([]);
    expect(app.texte()).toContain('jamais joué');
  });

  it("renvoie au dojo quand on ouvre l'arene sans seance en cours", async () => {
    window.history.replaceState({}, '', '/arena');
    await app.recharger();
    await app.attendre('choisis ton combat');
    expect(window.location.pathname).toBe('/');
  });

  it('refuse d\'abandonner si on se ravise', async () => {
    await app.clic('A');
    await app.clic('fight');
    await app.clicContenant('fight!');
    await app.attendre('impact');
    const confirm = window.confirm as unknown as { mockReturnValueOnce: (v: boolean) => void };
    confirm.mockReturnValueOnce(false);
    await app.clic('← quitter');
    expect(app.texte()).toContain('impact');
    await app.clic('← quitter');
    await app.attendre('choisis ton combat');
  });
});
