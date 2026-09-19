/** @vitest-environment jsdom */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { demarrerServeur, type ServeurDeTest } from '../test/serveur';
import { demarrerAppareil, type Appareil } from '../test/appareil';
import { etat, historiquePalier } from '../test/fabrique';

/**
 * ConOps 10 — trois seances a la meme charge sans gagner une rep : le dojo le
 * constate (« bloque » au briefing, « stalled » dans l'arene) et propose un
 * dechargement de 2,5 kg a un appui. Il n'applique rien : la baisse consentie ne
 * vaut que pour la seance, se reporte sur les series a cette charge, jamais sur
 * l'echauffement, et rien n'en est ecrit au journal.
 */
describe('bloque, et la decharge manuelle', () => {
  let serveur: ServeurDeTest;
  let app: Appareil;

  beforeAll(async () => {
    serveur = await demarrerServeur(etat({ logs: historiquePalier() }));
    app = await demarrerAppareil(serveur, { localStorage: { 'dojo.user.v1': 'u-1' } });
    await app.attendre('choisis ton combat');
  });

  afterAll(async () => {
    await app.demonter();
    await serveur.fermer();
  });

  it('le briefing compte les exercices bloques', async () => {
    await app.clic('A');
    await app.attendre('fight');
    expect(app.texte()).toContain('2bloqués');
    expect(app.texte()).toContain('bloqué');
    expect(app.texte()).toContain('3 séances sans montée');
    expect(app.texte()).toContain('60 à 100 kg');
  });

  it("l'arene ouvre le bandeau a la premiere serie, et la decharge attend la serie de travail", async () => {
    await app.clic('fight');
    await app.clicContenant('fight!');
    await app.attendre('stalled');
    expect(app.texte()).toContain('même charge depuis 3 séances');
    expect(app.texte()).toContain('décharger à 97,5 kg');
    expect(app.texte()).toContain('60'); // l'echauffement, intact

    await app.clic('décharger à 97,5 kg');
    await app.attendreAbsence('stalled');
    expect(app.texte()).toContain('déchargé −2,5 kg');
    expect(app.texte()).toContain('60'); // toujours : la baisse ne touche pas la rampe

    await app.clicBouton('impact');
    await app.clic('passer');
    expect(app.texte()).toContain('80');
    await app.clicBouton('impact');
    await app.attendre('série 3/3');
    await app.clic('passer');
    expect(app.texte()).toContain('97,5'); // la serie qui portait la charge bloquee
    expect(app.texte()).toContain('déchargé −2,5 kg');
    expect(app.texte()).not.toContain('stalled');
  });

  it("ne dit rien de plus sur un exercice bloque qu'on ne decharge pas, et n'ecrit rien de la decharge", async () => {
    await app.clicBouton('2');
    await app.clicBouton('impact');
    await app.attendre('Développé couché');
    await app.attendre('stalled');
    await app.clic('passer');
    await app.clicBouton('impact'); // sans decharger : le bandeau se referme de lui-meme a la serie suivante
    await app.attendre('série 2/3');
    expect(app.texte()).not.toContain('stalled');
    expect(app.texte()).toContain('bloqué 3 séances');
    await app.clic('terminer');
    await app.attendre('you win');
    await app.attendreSynchro();
    const log = (await serveur.lireJson()).logs.at(-1);
    expect(log?.entries.map((e) => e.weight)).toEqual([60, 80, 97.5, 50]);
    expect(JSON.stringify(log)).not.toContain('deload');
  });
});
