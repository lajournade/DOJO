/** @vitest-environment jsdom */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { act } from 'react';
import { demarrerServeur, type ServeurDeTest } from '../test/serveur';
import { demarrerAppareil, type Appareil } from '../test/appareil';
import { etat, historiquePalier, journal, serie } from '../test/fabrique';

/**
 * ConOps 13 — l'historique : le journal seance par seance, la suppression par
 * appui long, la lecture par exercice avec sa courbe, et l'export CSV au format
 * du tableur d'origine.
 */
describe("l'historique et l'export", () => {
  let serveur: ServeurDeTest;
  let app: Appareil;

  beforeAll(async () => {
    const logs = [
      ...historiquePalier(),
      journal({ date: '2026-09-13', programCode: 'P1-B', sessionId: 'ses-b', series: [serie('traction', 1, 0, 8, 2), serie('dips', 1, null, null)] }),
      journal({ date: '2026-09-14', user: 'u-2', series: [serie('squat-barre', 1, 200, 1, 0)] }),
    ];
    serveur = await demarrerServeur(etat({ logs }));
    app = await demarrerAppareil(serveur, { localStorage: { 'dojo.user.v1': 'u-1' } });
    await app.attendre('choisis ton combat');
    await app.clic('historique');
    await app.attendre('journal');
  });

  afterAll(async () => {
    await app.demonter();
    await serveur.fermer();
  });

  it('liste les seances du joueur, la plus recente depliee', async () => {
    const t = app.texte();
    expect(t).toContain('P1-B');
    expect(t).toContain('1 séries');
    expect(t).not.toContain('200 kg'); // le journal de l'autre joueur n'apparait pas
    expect(t).toContain('Traction');
    expect(t).toContain('0 kg');
    expect(t).toContain('—'); // la serie vide des dips
    expect(t).toContain('sér.reps');
  });

  it("deplie et replie une seance d'un appui, et la supprime d'un appui long", async () => {
    await app.clic('P1-A');
    expect(app.texte()).toContain('Squat barre');
    await app.clic('P1-A');
    await app.attendreAbsence('Squat barre');
    await app.appuyerLong('P1-B');
    await app.attendreAbsence('P1-B');
    await app.attendreSynchro();
    expect((await serveur.lireJson()).logs.map((l) => l.programCode)).toEqual(['P1-A', 'P1-A', 'P1-A', 'P1-A']);
  });

  it("lit la progression d'un exercice et trace sa courbe", async () => {
    await app.clic('par exercice');
    await app.attendre('exercice');
    expect(app.texte()).toContain('charge maximale par séance · 3 séances');
    expect(app.texte()).toContain('8×100kg (rir 1)');
    const cible = app.racine.querySelector('svg[role="img"] rect[fill="transparent"]') as SVGRectElement;
    await act(async () => {
      cible.dispatchEvent(new (window.PointerEvent ?? MouseEvent)('pointerdown', { bubbles: true }));
    });
    expect(app.texte()).toMatch(/· 100 kg/);
    await act(async () => {
      cible.dispatchEvent(new (window.PointerEvent ?? MouseEvent)('pointerdown', { bubbles: true }));
    });
    expect(app.texte()).toContain('· 3 séances');

    await app.choisir('#history-exercise', 'developpe-couche');
    await app.attendre('10×50kg');
    expect(app.texte()).toContain('· 3 séances');
  });

  it("n'a pas de courbe avec une seule seance", async () => {
    // On ne garde qu'une seance au journal.
    await app.clic('journal');
    await app.appuyerLong('P1-A');
    await app.attendre(() => app.texte().split('P1-A').length === 3);
    await app.appuyerLong('P1-A');
    await app.attendre(() => app.texte().split('P1-A').length === 2);
    await app.clic('par exercice');
    await app.attendre('Pas encore assez de séances');
  });

  it("propose l'export en CSV du joueur, tel que le serveur le produit", async () => {
    await app.attendreSynchro();
    const lien = app.racine.querySelector('a') as HTMLAnchorElement;
    expect(lien.textContent).toBe('exporter en csv');
    expect(lien.getAttribute('href')).toBe('/api/export.csv?user=u-1');
    const res = await fetch(lien.getAttribute('href') as string);
    const csv = await res.text();
    const lignes = csv.split('\r\n');
    expect(lignes[0]).toBe('Utilisateur;Programme;Date;Exercice;Série;Répétitions;Charge (kg);RIR');
    expect(lignes[1]).toBe('Ludo;P1-A;01/09/2026;Squat barre;1;8;60;');
    expect(lignes).toHaveLength(8); // 6 series, une ligne vide finale
  });

  it("dit quand le journal est vide", async () => {
    await app.clic('journal');
    await app.appuyerLong('P1-A');
    await app.attendre('Aucune séance enregistrée.');
    await app.clic('par exercice');
    await app.attendre('Aucune série enregistrée.');
    await app.clic('← dojo');
    await app.attendre('choisis ton combat');
  });
});
