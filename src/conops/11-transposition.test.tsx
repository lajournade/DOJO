/** @vitest-environment jsdom */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { demarrerServeur, type ServeurDeTest } from '../test/serveur';
import { demarrerAppareil, type Appareil } from '../test/appareil';
import { etat, historiqueCycle, joueur, programme, programmeForce } from '../test/fabrique';

/**
 * ConOps 11 — le passage d'un cycle a l'autre. 100 kg × 8 a RIR 2 valent un 1RM
 * de 133 kg, donc 107,5 kg pour 5 repetitions a RIR 2 (l'exemple du README, dont
 * la fourchette de force commence a 5). La rampe garde sa forme, et sans RIR rien
 * ne se transpose.
 */
describe('la transposition entre cycles', () => {
  let serveur: ServeurDeTest;
  let app: Appareil;

  beforeAll(async () => {
    serveur = await demarrerServeur(
      etat({
        programs: [programme(), programmeForce()],
        users: [joueur({ activeProgramId: 'prog-p2' })],
        logs: [...historiqueCycle(), { ...historiqueCycle(false)[0], id: 'sans-rir', date: '2026-09-04' }],
      }),
    );
    app = await demarrerAppareil(serveur, { localStorage: { 'dojo.user.v1': 'u-1' } });
    await app.attendre('choisis ton combat');
  });

  afterAll(async () => {
    await app.demonter();
    await serveur.fermer();
  });

  it("le briefing compte les exercices transposes et annonce la rampe transposee", async () => {
    expect(app.texte()).toContain('Force');
    await app.clic('A');
    await app.attendre('fight');
    expect(app.texte()).toContain('1transposé');
    expect(app.texte()).toContain('+7,5 kg');
    expect(app.texte()).toContain('62,5 à 107,5 kg');
    expect(app.texte()).toContain('5–6');
    expect(app.texte()).toContain('première fois'); // le developpe n'a pas d'historique
  });

  it("l'arene annonce le nouveau cycle des la premiere serie, rampe comprise", async () => {
    await app.clic('fight');
    await app.clicContenant('fight!');
    await app.attendre('nouveau cycle');
    expect(app.texte()).toContain('8 reps → 5 · 1rm est. 133 kg');
    expect(app.texte()).toContain('62,5');
    expect(app.texte()).toContain('5–6 reps');
    await app.clicBouton('impact');
    expect(app.texte()).toContain('85');
    expect(app.texte()).toContain('cycle +5 kg'); // 80 → 85 : l'ecart se lit serie par serie
    await app.clicBouton('impact');
    await app.attendre('série 3/3');
    expect(app.texte()).toContain('107,5');
    await app.clicBouton('2');
    await app.clicBouton('impact');
    await app.attendre('Développé couché');
    await app.clic('terminer');
    await app.attendre('you win');
  });

  it("des la seance suivante, l'historique est dans la fourchette : la double progression reprend", async () => {
    await app.clic('continue');
    await app.attendre('choisis ton combat');
    await app.clic('A');
    await app.attendre('fight');
    expect(app.texte()).not.toContain('transposé');
    expect(app.texte()).toContain('62,5 à 107,5 kg');
    expect(app.texte()).toContain('+1 rep'); // 5 reps a RIR 2 : encore une avant la charge
    await app.clic('← retour');
  });

  it('sans RIR, une seance est reconduite telle quelle', async () => {
    await app.attendreSynchro();
    // On retire la seance jouee et celle avec RIR : ne reste que l'import sans RIR.
    const json = await serveur.lireJson();
    json.logs = json.logs.filter((l) => l.id === 'sans-rir');
    await serveur.store.load().then((s) => Object.assign(s, json));
    await app.recharger();
    await app.attendre('choisis ton combat');
    await app.clic('A');
    await app.attendre('fight');
    expect(app.texte()).toContain('0montée');
    expect(app.texte()).toContain('60 à 100 kg');
  });
});
