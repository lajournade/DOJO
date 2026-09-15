/**
 * Le combattant, en donnees claires plutot qu'en images : chaque frame est un
 * tableau de lignes, un caractere par pixel, `.` pour le transparent, les
 * autres indexant une palette. Rien de binaire dans le depot, une frame se relit
 * et se corrige a la main, et changer de costume ne coute qu'un tableau de
 * couleurs.
 *
 * Les dessins viennent d'images generees (fond vert, style pixel art) passees
 * par `scripts/pixelize.py`, puis retouchees ici. L'image ne rentre pas au depot.
 * Le combattant est un buste, coupe a la ceinture, sur 48x48 : c'est le cadrage
 * des references, et celui du bandeau de combat.
 *
 * Le rendu est fait par <Sprite> ; ici on ne produit que la geometrie.
 */

export type Palette = Record<string, string>;

/** Une suite horizontale de pixels de meme couleur, fondue en un seul rectangle. */
export interface Run {
  x: number;
  y: number;
  w: number;
  key: string;
}

export interface Sprite {
  w: number;
  h: number;
  frames: Run[][];
}

/**
 * Fusion des suites : un sprite 48x48 tombe de 2304 rectangles a quelques
 * centaines. C'est ce qui rend le rendu SVG viable a plusieurs sprites a l'ecran.
 */
function encode(rows: string[], w: number): Run[] {
  const runs: Run[] = [];
  rows.forEach((raw, y) => {
    const row = raw.padEnd(w, '.');
    let x = 0;
    while (x < w) {
      const key = row[x];
      let n = 1;
      while (x + n < w && row[x + n] === key) n += 1;
      if (key !== '.') runs.push({ x, y, w: n, key });
      x += n;
    }
  });
  return runs;
}

/** Toutes les frames d'un sprite partagent la grille de la premiere. */
const sprite = (frames: string[][]): Sprite => {
  const w = Math.max(...frames[0].map((r) => r.length));
  const h = frames[0].length;
  return { w, h, frames: frames.map((f) => encode(f, w)) };
};

/**
 * Frame de respiration : une ligne vide inseree en haut, la ligne de cou
 * retiree — la tete s'enfonce d'un pixel dans les epaules, le reste du corps
 * ne bouge pas.
 */
const breathe = (rows: string[], neck: number) => [
  '.'.repeat(rows[0].length),
  ...rows.slice(0, neck),
  ...rows.slice(neck + 1),
];

/* ------------------------------------------------------------------ palettes */

/**
 * `b` (ceinture) et `k` (cheveux) portent l'identite d'un joueur. `r` est le
 * sang, fixe : il ne doit pas changer avec le costume. Sur les references la
 * ceinture est noire et le sang rouge, `pixelize.py` sort donc `o`/`k` pour
 * l'une et `b` pour l'autre ; on inverse a la main en collant (sang -> `r`,
 * puis ceinture -> `b`).
 */
const BASE: Palette = {
  o: '#000000',
  k: '#5a3418',
  s: '#f5c8a0',
  S: '#be8c69',
  w: '#f5f0e6',
  W: '#aaafbe',
  e: '#ffffff',
  b: '#e01b24',
  r: '#b0142a',
};

/**
 * Un costume par joueur, obtenu par permutation de palette : c'est le truc des
 * costumes alternatifs des jeux de combat, et chaque profil gagne sa silhouette
 * de couleur pour le prix d'un tableau.
 */
const COSTUMES: Palette[] = [
  { ...BASE, b: '#e01b24', k: '#5a3418', W: '#4a4f66' },
  { ...BASE, b: '#29b6d8', k: '#1c3a5e', W: '#2f4f66', s: '#e0b088', S: '#a87850' },
  { ...BASE, b: '#d84fa0', k: '#4a1e5a', W: '#5a3a5a' },
  { ...BASE, b: '#21c07a', k: '#1e4a2a', W: '#375a4a', s: '#d8ab86', S: '#a07048' },
  { ...BASE, b: '#ffd400', k: '#b8862a', W: '#6a5a2a' },
];

export const costume = (index: number): Palette =>
  COSTUMES[((index % COSTUMES.length) + COSTUMES.length) % COSTUMES.length];

/* -------------------------------------------------------------------- dessins */

// Frais : garde haute, kimono net, lunettes droites. La premiere moitie de la seance.
const HERO_FRESH = [
  '......................oko.......................',
  '...................ookkokokko...................',
  '...................kkkkkokokko..................',
  '..................okkookkokkkko.................',
  '.................ookkkkokkkkokko................',
  '................okkkkooookokokko................',
  '................okkkkSsSSsSkokoo................',
  '.................okoksssssSkooo.................',
  '.................ookSsssssSSoo..................',
  '..................SkkkkSSkkkkk..................',
  '.................oSkSSSkkSSSkSo.................',
  '.................oSSSSSSSSSSSSo.................',
  '..................kSSSSssSSSSk..................',
  '...................ksssSSssSo...................',
  '...................kssSSSsSS....................',
  '..................kkSssSSsSk....................',
  '.................SWkSSssssSkko..................',
  '...............okwkSsSSSSSSkWSo.................',
  '.............kkSWwSSssSSSSSkkwkok...............',
  '...........oSwwwWwwkSssSSSSSkwWkwSk.............',
  '.........kWWWWwwWwwWSsssSSSSkSSkkSsSoo..........',
  '........kswwwwWwwWwwSSSsssSSkSSSsSSwWwSo........',
  '.......kkkkWwwwwwWwwWkSSsSSSkkSssskwWwwS........',
  '......kkSSSkwwwwwWWwwSSSSSsSksSSssSWwWwk........',
  '.....oSSsssskwwWwwWwwsSsSSskSSssssSSwwwkk.......',
  '.....oksssssowwWwWwWwwSSsSskSSSSsSSkWwkSS.......',
  '......ksssssSSwWwWwwWwWksSsSkSsssSSkSWSsSo......',
  '......kssssSSkSWWwwwwwwSSSsskSkkSSSSkkSSSo......',
  '......kSsSSSSSkWWwwwwWwskSsSSwwkSSSsSksSSo......',
  '.....oSSSSssSkkWWWkkkkwwkkSSswWwkkSssSSssS......',
  '.....ksSSssssSkSwkssSSSwskSkwwWwwkSSssSSssk.....',
  '....ossssssssSoWkSsSSSkswSkkwwWwwWkSSssSkSS.....',
  '....SssSSsssSSkkSssssSkSwwkwwwwwwWkSSsssskko....',
  '....SsSSssssSkkSSssSSSkkwWSwwWwwWWkSSssSsssk....',
  '....SssssSSSSkSsSssssSSsWWWwwWwwWWkSSSsSSssSo...',
  '....ksSkkkkkksssSssSSkWwWWwwwWwWWWSkSSssSSssk...',
  '...oSSSsssSSssssSSSSSkwwWwwwWwwWWWSkSSSsSSSsk...',
  '...ksSssssssssSSSSokkwwWWwwwWwwWWWWkSSSSsSSSk...',
  '...ksssssssssSSSkSwwwwwWwwwWwwwwWWWkkSSSssSSo...',
  '...kssSSsssSSSSkWwwwwwWWwwWWwwwwWWWkokSSSsSS....',
  '...kSSSSssSSSSkSWWWWWWWwwwWwwwwwWwS..okkSsSk....',
  '....SSSssSSSSkokSwWWWWWwwWWwwwWWwWk....okkk.....',
  '....SssSSSSsSo..okWwWWwwWWwwWWwwWko.............',
  '....ksSSSSSko....oobbbbbbbbbbbbbbo..............',
  '.....kkkooo.....Sobbbbbbbbbbbbbbbo..............',
  '...............SWWSbbbbbbbbbbbbbSWk.............',
  '..............ksWwwWwSbbbbbbbbWwWwSo............',
  '..............WwwwwwwbbbWWwSbbbwwWwk............',
];

// Fatigue : oeil au beurre noir, kimono dechire, sang et bleus, la garde tient encore.
// La seconde moitie.
const HERO_TIRED = [
  '.....................okk........................',
  '..................ookokkkok.....................',
  '.................okrkkrokokko...................',
  '.................orkookkookkko..................',
  '...............okkkkkkokkkrokk..................',
  '...............ookkkooookokokko.................',
  '...............okkkkSsSSsSkokoo.................',
  '...............ookokSssssSkooo..................',
  '................ookSsssssSSooo..................',
  '.................SkkkkSSkokkk...................',
  '................oSSSSSkkSSkkk...................',
  '................oSSSSSSSSkkrr...................',
  '.................kSSSssSSSrSk...................',
  '..................krSsSSsSSo....................',
  '..................kSsSSSSSr.....................',
  '.................kkSsSSSSSk.....................',
  '................SSkSSsSSSrkk....................',
  '...............kwkSsSSSSrSkWk...................',
  '..........okkWWWwSSsSSSSSSkkskk.................',
  '........kkWwsswWwskssSSSSSrkSWWSkk..............',
  '.......okswsSSwWWwkSsSsSSSSSkwWWwwSSSk..........',
  '......kkkkwswswwWwskSSSssSSSkswWwwwwko..........',
  '....oWSkSkSkswWwWwwkSsSSSSssSSSWSswSSSo.........',
  '....SWksSrSSSwWwWWwwkssSSssSSkkkSSswSsSk........',
  '....kksSrSsskwWwwWwwSSSSSsssSSsSsSksSsSWk.......',
  '....kSsSsSsSWwWwwwSwWSssSSrsSkSSsSkskSsSk.......',
  '.....SssssskWwWwwwSSwSSsSsSSkSSSSrrSsSsS........',
  '.....SssssSSkwWwwwsSssksSssSSkSSsSrkkSSS........',
  '.....kssSSrrkWWwWwWsswSSrssSkkSSsSSSksSSo.......',
  '....oSSSSSSSkWWwWwWwwWkkrSSSkkSssSSSSSssS.......',
  '....SSSsSrSSSkSWSkkSSwSWkrSSkWkkSSSSskSssk......',
  '...kSsssSrSSSoWSSsssSWwwkSSkWWSkSSSsssSkSk......',
  '...SssSsSSSSSkSkSsSSkkwwSSSkwWWWSkkSsssSWko.....',
  '...SsSSssssSkkkSSSSsSkWwkSSSWWwwSSkSSssSSSWk....',
  '...SsSsssSSSoksSSsSSkkWwSSksWWwSSWkSSssSSSSk....',
  '..oSsSkkkkkkSSsSSSSSkSWWwSSwWWsSSWkSSSsSssSSo...',
  '..ksSSssSSSssssSsssSkwWWsSwwWwswSWkSSSsSSssk....',
  '..ksSsssSssssssSSSSSWwwWkwwWWwswWWkkSSSSSSsk....',
  '..ksssssSSsssSSSrkSWwWwwSwwWsswWwSokSSsSkSSk....',
  '..kssSSSrSsSSSkSSWwWWWWSwwWWSSwwWSokSSSSSSSo....',
  '..kSSSSrSsSSSkkWWwWwwWWSwwWsSswWwwk.kSSsSSS.....',
  '...SSSSSSSSSr.oksWwWwwSsWWwsswWwWWS.okSSsSk.....',
  '...SssSSSSSSo..ookSwWkWWWWWWWSWkkWo...oSSSo.....',
  '...ksSSSSSSo...oobbbbbbbbbbbbbbbbo.....ooo......',
  '...orSkokko...kSbbbbbbbbbbbbbbbbbo..............',
  '.............SWwwsWWSbbbbbbbbWWwwSk.............',
  '.............WwWswWwSbbbbbbbbWwWkkSo............',
  '............kwWwwWwwbbbWwwSbbbwwSsSk............',
];

// Vainqueur : poing leve, sourire, les habits en lambeaux. L'ecran de resultats.
// Tire d'une reference plus ancienne (bandeau, gants, pas de lunettes) recadree au
// buste : a remplacer quand une image du meme personnage existera.
const HERO_VICTORY = [
  '................................................',
  '................................................',
  '................................................',
  '................................................',
  '................................................',
  '................................................',
  '................................................',
  '.....................................okko.......',
  '...................................kkkbbbo......',
  '.....................k.............SSkbbbk......',
  '...................okkkkkkk.......kkSSbbbbo.....',
  '..................okkkkkkkkk......SSSSkkbbk.....',
  '..................kkkkkkkkkkk.....kkkSkkbbk.....',
  '.................okkkkkkkkkk.......okkkkkbkk....',
  '............bbbbkkkkkkkokkook.......okkkkkbk....',
  '.......b.bbbbbb.kkkbbkbbkkkk..........okkbbbo...',
  '......bbbbbb...bbkkokbbbbkoo..........obbbbbo...',
  '......bbbb....bb.oSkkkSSkSkk...........kbbkkk...',
  '............bbb...SSSSSSSsSk...........okkSSS...',
  '.........bbbbb....obbssSsskk.....k.....oSSssSo..',
  '..........bb....oSokssSSsSoSkkokSkkk...oSSsssS..',
  '.........kk...okSkkSSSSSSSkksSWwSSSkoooksSSsSSo.',
  '.........kWWSSsWskSSSSssSSSSSWwwSSsSSSSkssSsssk.',
  '........kkkSwwwWsSssSkkkSSSSkswsksSsSSskssSssSk.',
  '........kSSSWwsWskSSSSSSsSSSSwWWSSSsSssksssSsSk.',
  '.......kSssSkswWsSSSSSSSSSsSSwWwSkSsssSSSssSsSo.',
  '.......kSSSsSswWsSssssSSssssSwWwSkSSSSSSSSSSsSo.',
  '.......SSkSsSWwwsSssssSsssssSwWskSSSSSsssSSSSSo.',
  '.......SSSSsSSwwsSssssSSsSssSwWwkkSSSssSSSSkkk..',
  '......oSSSsSSwwwwSssssSsssSskwsskkkkSSSSkko.....',
  '.....kSSssSSSWwwwSSsssSsssSSSwwWSSk.oooo........',
  '.....ksSSSSSkWwswSSsssSSsssSswwWWSk.............',
  '.....SsSsssSkkwwWwkSSSSSSSSSwWwsWkS.............',
  '....oSsssssSkSswWwkSSSssSSSSwWwwWSo.............',
  '....ksSssSsSkWWwWwWSSSSSSsSWwWwwWk..............',
  '...oSsSsSSSSoWwwswwkSSSSSSkwWwwwWk..............',
  '...kssSSSSSk.kWwwWwSSSSSSSWwWwwWS...............',
  '..kSssSSSSk..kSwwswsoSSSSkwwswwWk...............',
  '..kSssSSko....SWwwWwSkSSSSwWwwwWk...............',
  '..kSssSSS.....WwWWwWwskSSswwsWWWk...............',
  '.oSSSsSSS.....kSWSSWSWWSSwWWSWWk................',
  '.oSSSsssS......okkkkkSSkSSSkkko.................',
  '.oSSssSSk.......okbbbkkbbobbbbk.................',
  '.oSsssSk.......kWWSkkkkbbkbkkkko................',
  '..SsssSo......oWwwwwSbkbkkkWwsWk................',
  '..kkkkk.......kwwwwskbkkkbkWwsWWk...............',
  '.kbbbbko.....kwwwwwwkbkWSbbWwwSwS...............',
  '.kbbbbbo....kswSkwwsbbkwSbbWwwkWsk..............',
];

/**
 * Frames du combattant : 0-1 frais en respiration, 2-3 fatigue en respiration,
 * 4 vainqueur. `HERO_FRAME` donne la premiere frame de chaque etat ; on y
 * ajoute l'index de respiration (0 ou 1).
 */
export const HERO = sprite([
  HERO_FRESH,
  breathe(HERO_FRESH, 14),
  HERO_TIRED,
  breathe(HERO_TIRED, 14),
  HERO_VICTORY,
  breathe(HERO_VICTORY, 19),
]);
export const HERO_FRAME = { fresh: 0, tired: 2, victory: 4 } as const;

/** Le cadre du portrait, pour le bandeau et les tuiles : la tete et les epaules, sans le vide. */
export const HERO_BUST = { x: 8, y: 0, w: 32, h: 26 } as const;
