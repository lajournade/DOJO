/** @vitest-environment jsdom */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { demarrerServeur, type ServeurDeTest } from '../test/serveur';
import { demarrerAppareil, type Appareil } from '../test/appareil';
import { etat, historiqueMontee } from '../test/fabrique';

/**
 * ConOps 2 — une seance de bout en bout : la tuile, le briefing, l'intro, chaque
 * serie validee d'un appui, le RIR sur la derniere, l'ecran de resultats, et le
 * journal qui atterrit dans `sport.json` cote serveur.
 */
describe('une seance complete', () => {
  let serveur: ServeurDeTest;
  let app: Appareil;

  beforeAll(async () => {
    serveur = await demarrerServeur(etat({ logs: historiqueMontee() }));
    app = await demarrerAppareil(serveur, { localStorage: { 'dojo.user.v1': 'u-1' } });
  });

  afterAll(async () => {
    await app.demonter();
    await serveur.fermer();
  });

  it('annonce le combat au briefing sans engager de seance', async () => {
    await app.attendre('choisis ton combat');
    expect(app.texte()).toMatch(/il y a \d+ (j|sem)\./);
    await app.clic('A');
    await app.attendre('fight');
    const t = app.texte();
    expect(t).toContain('vs');
    expect(t).toContain('Séance A');
    expect(t).toContain('séries');
    expect(t).toContain('montées'); // le squat monte en charge, le developpe en reps
    expect(t).toContain('+2,5 kg');
    expect(t).toContain('+1 rep');
    expect(t).toContain('60 à 102,5 kg'); // la rampe, et la serie de travail montee
    expect(t).toContain('min'); // duree mesuree sur la seance precedente (50 min)
    expect(t).toContain('50');

    await app.clic('← retour');
    await app.attendre('choisis ton combat');
    expect((await serveur.lireJson()).liveSessions).toEqual({});
  });

  it("entre dans l'arene et valide chaque serie", async () => {
    await app.clic('A');
    await app.attendre('fight');
    await app.clic('fight');
    await app.attendre('fight!');
    await app.clicContenant('fight!');
    await app.attendre('impact');

    expect(app.texte()).toContain('Squat barre');
    expect(app.texte()).toContain('série 1/3');
    expect(app.texte()).toContain('8–12 reps');
    expect(app.texte()).toContain('record 100 kg');
    expect(app.texte()).toContain('60'); // la charge de la premiere serie, l'echauffement
    // Le chrono de la seance tourne des l'entree dans l'arene.
    expect(app.texte()).toContain('temps');
    expect(app.texte()).toMatch(/\d{2}:\d{2}/);

    await app.clicBouton('impact');
    await app.attendre('série 2/3');

    await app.clicBouton('impact');
    await app.attendre('série 3/3');
    expect(app.texte()).toContain('rir — dernière série');
    expect(app.texte()).toContain('102,5'); // la montee proposee sur la serie de travail
    await app.clicBouton('2');
    expect(app.texte()).toContain('solide');
    await app.clicBouton('impact');

    await app.attendre('Développé couché');
    expect(app.texte()).toContain('exo 2/2');
    expect(app.texte()).toContain('série 1/3');
    await app.clicBouton('impact');
    await app.clicBouton('impact');
    await app.attendre('finish him');
    await app.clicBouton('3');
    expect(app.texte()).toContain('facile');
    await app.clicBouton('finish him');
    await app.attendre('you win');
  });

  it('affiche le bilan puis ramene au dojo', async () => {
    const t = app.texte();
    expect(t).toContain('tonnage');
    expect(t).toContain('rang');
    expect(t).toContain('nouveaux records');
    expect(t).toContain('Squat barre · 102.5 kg');
    await app.clic('continue');
    await app.attendre('choisis ton combat');
    expect(app.texte()).toContain("aujourd'hui");
    expect(app.texte()).not.toContain('continue ?');
  });

  it('a tout ecrit dans sport.json', async () => {
    await app.attendreSynchro();
    const json = await serveur.lireJson();
    expect(json.liveSessions).toEqual({});
    expect(json.logs).toHaveLength(2);
    const log = json.logs[1];
    expect(log).toMatchObject({ userId: 'u-1', programCode: 'P1-A', sessionId: 'ses-a' });
    expect(log.endedAt).not.toBeNull();
    expect(log.entries.map((e) => [e.exerciseId, e.setIndex, e.weight, e.reps, e.rir])).toEqual([
      ['squat-barre', 1, 60, 8, null],
      ['squat-barre', 2, 80, 8, null],
      ['squat-barre', 3, 102.5, 8, 2],
      ['developpe-couche', 1, 50, 11, null], // la rep de plus vaut pour toutes les series au poids de travail
      ['developpe-couche', 2, 50, 11, null],
      ['developpe-couche', 3, 50, 11, 3],
    ]);
    // Le plan est conservé pour la reprise ; le curseur reste propre à la séance en cours.
    expect(log?.plan).toHaveLength(2);
    expect('cursor' in log).toBe(false);
    expect(localStorage.getItem('dojo.queue.v1')).toBe('[]');
  });
});
