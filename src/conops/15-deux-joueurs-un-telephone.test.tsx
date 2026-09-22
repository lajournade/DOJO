/** @vitest-environment jsdom */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { demarrerServeur, type ServeurDeTest } from '../test/serveur';
import { demarrerAppareil, type Appareil } from '../test/appareil';
import { etape, etat, joueur, programme, seanceEnCours } from '../test/fabrique';

/**
 * ConOps 15 — deux joueurs, un seul telephone. Un appui sur le portrait passe a
 * l'autre joueur, dans son arene s'il a une seance en cours, sur le choix de la
 * seance sinon ; et chaque arene se retrouve telle qu'on l'a laissee — le compteur
 * regle mais pas valide, le combo, la serie ou l'on en etait.
 */
describe('deux joueurs se relaient sur un telephone', () => {
  let serveur: ServeurDeTest;
  let app: Appareil;
  const portrait = () => app.cliquer('[aria-label="changer de joueur"]');

  beforeAll(async () => {
    serveur = await demarrerServeur(
      etat({ users: [joueur(), joueur({ id: 'u-2', name: 'Marie', palette: 1 })] }),
    );
    app = await demarrerAppareil(serveur, { localStorage: { 'dojo.user.v1': 'u-1' } });
  });

  afterAll(async () => {
    await app.demonter();
    await serveur.fermer();
  });

  it('Ludo entame A, valide deux series et regle la charge de la troisieme', async () => {
    await app.attendre('choisis ton combat');
    await app.clic('A');
    await app.clic('fight');
    await app.clicContenant('fight!');
    await app.attendre('impact');
    expect(app.texte()).toContain('1P');
    expect(app.texte()).toContain('Ludo');
    await app.clicBouton('impact');
    await app.clicBouton('impact');
    await app.attendre('série 3/3');
    expect(app.texte()).toContain('good hits'); // le combo
    await app.appuyer('augmenter'); // la charge, sans valider : 0 → 2,5 kg
    expect(app.texte()).toContain('2,5');
  });

  it("le portrait passe a Marie, qui n'a rien en cours : le choix de la seance", async () => {
    await portrait();
    await app.attendre('choisis ton combat');
    expect(window.location.pathname).toBe('/');
    expect(app.texte()).toContain('Marie');
    expect(app.texte()).not.toContain('continue ?'); // la seance de Ludo n'est pas la sienne
  });

  it('Marie entame B et valide une serie', async () => {
    await app.clic('B');
    await app.clic('fight');
    await app.clicContenant('fight!');
    await app.attendre('impact');
    expect(app.texte()).toContain('2P');
    expect(app.texte()).toContain('Traction');
    expect(app.texte()).not.toContain('good hits'); // le combo de Ludo n'est pas le sien
    await app.clicBouton('impact');
    await app.attendre('série 2/3');
  });

  it("retour a Ludo : son arene, telle qu'il l'a laissee", async () => {
    await portrait();
    await app.attendre('impact');
    expect(window.location.pathname).toBe('/arena');
    const t = app.texte();
    expect(t).toContain('1P');
    expect(t).toContain('Squat barre');
    expect(t).toContain('série 3/3');
    expect(t).toContain('2,5'); // la charge reglee avant le relais, pas la proposition
    expect(t).toContain('good hits'); // le combo aussi
  });

  it("l'aller-retour tient : Marie a sa serie 2, Ludo sa serie 3", async () => {
    await portrait();
    await app.attendre('série 2/3');
    expect(app.texte()).toContain('Traction');
    await portrait();
    await app.attendre('série 3/3');
    expect(app.texte()).toContain('Squat barre');
  });

  it('chacun termine la sienne : deux journaux, aucune seance en cours', async () => {
    await app.clic('terminer');
    await app.attendre('you win');
    await app.clic('continue');
    await app.attendre('choisis ton combat');
    expect(app.texte()).not.toContain('continue ?');

    // Depuis le Roster, le portrait mene droit dans l'arene de Marie.
    await portrait();
    await app.attendre('impact');
    expect(app.texte()).toContain('série 2/3');
    await app.clic('terminer');
    await app.attendre('you win');
    await app.attendreSynchro();

    const json = await serveur.lireJson();
    expect(json.liveSessions).toEqual({});
    expect(json.logs.map((l) => [l.userId, l.programCode])).toEqual([
      ['u-1', 'P1-A'],
      ['u-2', 'P1-B'],
    ]);
  });

  it("le nom ouvre toujours le select player, et l'appareil retient le dernier joueur", async () => {
    await app.clic('continue');
    await app.attendre('choisis ton combat');
    expect(localStorage.getItem('dojo.user.v1')).toBe('u-2');
    await app.clic('changer');
    await app.attendre('select player');
    expect(app.texte()).toContain('Ludo');
  });
});

describe("seul dans le dojo, le portrait n'est qu'un dessin", () => {
  let serveur: ServeurDeTest;
  let app: Appareil;

  beforeAll(async () => {
    const p = programme();
    const live = seanceEnCours({ plan: p.sessions[0].items.map(etape) });
    serveur = await demarrerServeur(etat({ programs: [p], liveSessions: { 'u-1': live } }));
    app = await demarrerAppareil(serveur, { localStorage: { 'dojo.user.v1': 'u-1' } });
  });

  afterAll(async () => {
    await app.demonter();
    await serveur.fermer();
  });

  it('ni au dojo ni dans l\'arene', async () => {
    await app.attendre('continue ?');
    expect(app.racine.querySelector('[aria-label="changer de joueur"]')).toBeNull();
    await app.clic('continue ?');
    await app.attendre('impact');
    expect(app.racine.querySelector('[aria-label="changer de joueur"]')).toBeNull();
    expect(app.texte()).not.toContain('1P');
  });
});
