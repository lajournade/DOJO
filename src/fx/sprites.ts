/**
 * Le combattant, en donnees claires plutot qu'en images : chaque frame est un
 * tableau de lignes, un caractere par pixel, `.` pour le transparent, les
 * autres indexant une palette. Rien de binaire dans le depot, une frame se relit
 * et se corrige a la main, et changer de costume ne coute qu'un tableau de
 * couleurs.
 *
 * Les dessins viennent d'images generees (fond vert, style pixel art) passees
 * par `scripts/pixelize.py`, puis retouchees ici. L'image ne rentre pas au depot.
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
 * Fusion des suites : un sprite 48x64 tombe de 3072 rectangles a quelques
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

/** `b` (ceinture, bandeau, gants) et `k` (cheveux) portent l'identite d'un joueur. */
const BASE: Palette = {
  o: '#000000',
  k: '#2a1e3c',
  s: '#f5c8a0',
  S: '#be8c69',
  w: '#f5f0e6',
  W: '#aaafbe',
  e: '#ffffff',
  b: '#e01b24',
};

/**
 * Un costume par joueur, obtenu par permutation de palette : c'est le truc des
 * costumes alternatifs des jeux de combat, et chaque profil gagne sa silhouette
 * de couleur pour le prix d'un tableau.
 */
const COSTUMES: Palette[] = [
  { ...BASE, b: '#e01b24', k: '#2a1e3c', W: '#4a4f66' },
  { ...BASE, b: '#29b6d8', k: '#123a4a', W: '#2f4f66', s: '#e0b088', S: '#a87850' },
  { ...BASE, b: '#d84fa0', k: '#3a1c3a', W: '#5a3a5a' },
  { ...BASE, b: '#21c07a', k: '#14342a', W: '#375a4a', s: '#d8ab86', S: '#a07048' },
  { ...BASE, b: '#ffd400', k: '#4a3a10', W: '#6a5a2a' },
];

export const costume = (index: number): Palette =>
  COSTUMES[((index % COSTUMES.length) + COSTUMES.length) % COSTUMES.length];

/* -------------------------------------------------------------------- dessins */

// Frais : garde haute, kimono net. La premiere moitie de la seance.
const HERO_FRESH = [
  '.......................o........................',
  '.....................kkkkkkkk...................',
  '....................okkkkkkkk...................',
  '....................okkkkkkko...................',
  '................bbbbkkkkkkkko...................',
  '...............bbb.bkbbbbbbb....................',
  '.............bbb..bbkkkSSkkko...................',
  '.................bb.kSskSksSo...................',
  '...............bbbkokkssssskk...................',
  '...............bkkWkskSsSsSkwSkk................',
  '..............kSWwwSskSssSSSsWSWSSk.............',
  '............oSSSwwWwsSSSkSskswWwwwWk............',
  '............SsSSwwWwWokkSSSkwWwwwSSS............',
  '...........ksssSswWSkbSSksSkwWwwWkssk...........',
  '...........kssSSSsWkbbkSksSSwWwwSsssS...........',
  '...........kSSsskWkbbbkSksSswWwwksssS...........',
  '...........kSssSbkkbbbkSkskwwWWwkSSsk...........',
  '..........oSsSSSkbkbbkkkSSSwWwWkSssSsk..........',
  '..........osSSsskbbkkSwkSkwwWwWksssssS..........',
  '..........osSsssSkbksswWkWwWkkkossssssk.........',
  '..........oSSsssSkoWwWwskwwSSSbkSSSSSsk.........',
  '...........kssSSSSSwwwWSswWkSkbbkkkSsSk.........',
  '...........kSSSSSkWwwwWSwwWkSkbbkbkSssso........',
  '...........oSSSSkkwWwwSWwWwSSkbbkbkSssSo........',
  '............kkk..kWWWSSwsWwwkkkbkbkSsSSo........',
  '..................kSSkWSkSwWWSk.okSSSsS.........',
  '..................obbbkkbkkkkko...kSSko.........',
  '..................kSkkobbkbbkkk.................',
  '.................kwwwWkkkkkWwwWo................',
  '................kswwwkbkkbkSwwWS................',
  '................WWwwWkbkWkbSwwkWo...............',
  '...............ksWwwSbbSwkbSwwkWS...............',
  '..............oWWWwwSbbSwkbSwWWWWk..............',
  '...............kWWwwkbbSwkbSWWWwko..............',
  '...............SwWWkkbbkWkbkWWwwS...............',
  '..............oswwwskbkSSkbkwwwwwk..............',
  '..............SwwwwwkbkWWkbkwwwwwS..............',
  '..............SwwwwwSkkWSkbkwwwwwso.............',
  '.............kwwwwwwwwWkkWWswwwwwwS.............',
  '.............kwwwwwwwWWkkWWwwwwwwwS.............',
  '.............SwwwwwwwWW.oWWwwwwwwwwk............',
  '............owwwwwwwWWk..kWWwwwwwwwk............',
  '............oswwwwwWsS...kWWWwwwwwwk............',
  '............kWwwwwwwwk....SwWwwwwwwso...........',
  '...........kWWwwwwwwS.....oWwwwwwwwso...........',
  '..........kswWwwwwWWk......kwwwwwwwwk...........',
  '..........SwwwwwwWWk.......kWwwwwwwWWk..........',
  '..........SwwwwwWWwk........kWwwwwwWWS..........',
  '.........kswwwwWWwS.........kWWwwwwWwwo.........',
  '.........kwwwwwWwwk.........kWwWwwwWwwk.........',
  '.........kwwwwwwwsk.........kWwwWwwWwwWo........',
  '........owwwwwwwwS...........kwwwwwwwwso........',
  '........kwwwwwwwWk...........kWwwwWwwwwk........',
  '........WwwwwwwwWo............SwwwwwwwwS........',
  '.......kwwwwwwwWWo............SWwwwwwwwWk.......',
  '.......kwwwwwwWWk.............kWWWwwwwwwk.......',
  '........kwwwwWWWk.............oWWswwwwwSo.......',
  '.........kSwwwWkk..............SWwwwwwkk........',
  '........oSSkkkk.................oSWSkkSo........',
  '........SssSk.....................okSSsk........',
  '.......ksssSk......................kSsssk.......',
  '......kSssssk......................SSsssSk......',
  '.....kSSSSsSk......................oSsSSSSk.....',
  '.....kkkkkko........................okkkkkk.....',
];

// Fatigue : kimono dechire, bleus, la garde tient encore. La seconde moitie.
const HERO_TIRED = [
  '.......................ko.......................',
  '.....................okkkkkko...................',
  '.....................kkkkkkkk...................',
  '.................bbbkkkkkkkkk...................',
  '...............bbb..kbkkkkkko...................',
  '.............bbb..bbkkbbbbbk....................',
  '.............bb..bb.kkSkSSkko...................',
  '................bb..oSSSSSsk....................',
  '..............bbb..oSkSsSsSkkk..................',
  '.................kSSkSSsSsSSsSSk.kk.............',
  '..............oSSsWsSSSSSSSssSsWSko.............',
  '............okSSwwWWkSSSSSSSSSwWSSSk............',
  '............ksSkssSbbSkkSSSsSWwwksssk...........',
  '...........oSSsSSWkbbSSSsssssSswWSSSS...........',
  '............SsSSkSbbbbSSSsssSWWWSsSSS...........',
  '............SSsSkkbbbbkSSsSSSssSSSsSSo..........',
  '...........ksSSkbbbbkkSsSssSSWwSSSSSSSo.........',
  '...........SSSSSbbkkSSssSSsskwskSsssssk.........',
  '..........kSsssSbbbkWkSSSSSSWswWkssssSS.........',
  '..........oSssssSkkWwkSsSsSSwWwsoSssSSSk........',
  '..........kssSSSSkSWwSSSSSSSwSSkbokkSssso.......',
  '..........kssSSSSoSwsskSSSSwWkSkbbkbSsssS.......',
  '...........kSSSSk.WwwwSSSSSwWkSSbbbbksSSW.......',
  '...........oSSko.kwwwWsSSSWwwSSSbbbbksSSk.......',
  '.................WWsSkSWWSwsWwkSbbkkkSSS........',
  '................kSokkbkkkkkkkwWk...okSkk........',
  '................o..SkkbkbbkbbkwS.....kSS........',
  '..................kwwwWkkbkkkSko......kS........',
  '..................WwwsSbkkkkwwSS................',
  '.................WwWwwSbSWbkwwSwk...............',
  '................SsSSwwkbSsbkwwSSwk..............',
  '...............kkkWWwwbbWsbkwwSWSk..............',
  '...............koWWWkWbbWsbkwwSWSk..............',
  '................SwwwWkbbWWbbWSSwwk..............',
  '...............kwwwwwSbbkkbbkWwwwWo.............',
  '...............SwsSkwSbkWWbbSwwwSsS.............',
  '..............ksSSSSWSbkWSbbSwwwssSk............',
  '.............kSksSsSWkbkWSkkWwwwwwwk............',
  '.............okSsssSwwWSkSWWWwwwwkSS............',
  '..............oSSSsWwwWWokWWwswwWSSko...........',
  '..............SswWwwwWWS.oWWwwwwSSsS............',
  '.............kwwwwwwWwwk..kWWwwwSsssk...........',
  '.............Wwsswwwwwk...oSWWwwsSssk...........',
  '............kWwswwwwWko....kwWWwwwSSS...........',
  '...........SwswwwwWWWo.....oWwsWwwWWwS..........',
  '..........kWwwwwwWWWk......kkwwwwwwwwso.........',
  '..........okwwwwWWWWo......kkwswwwwwsWo.........',
  '..........SSWwwwWWWW........kWkwwwwwSSk.........',
  '..........SsSWSwwWwk.........kSSwwwSSSwk........',
  '.........ksssSSwWwwS.........okWwwwSsSwS........',
  '.........ksssSSwwwwS..........ksWwWSSWwwk.......',
  '.........ksSSkwwwkWk..........kwWWwwSwwwo.......',
  '........oSsSSwwwkok...........owsWswwwwk........',
  '........SSSSwwwWS.o............SSWWwwwwSk.......',
  '.......kssSwwwWWW..............oWwWWwwwwsk......',
  '.......kSwwwwWWsW..............kWwwWWwwwSS......',
  '........SSWwwwwkS..............SWwwwwwsSoo......',
  '........kSSSWwk.................kwsSwskk........',
  '........SSSSoS..................oWkoSSSS........',
  '.......ksSSk.....................k..kSssk.......',
  '......kSsssS........................kssSSk......',
  '....oSSsssSk........................SSssSsk.....',
  '....kSSSSsk.........................oksSSSSk....',
  '....oookkk............................kkkkko....',
];

// Vainqueur : poing leve, sourire, les habits en lambeaux. L'ecran de resultats.
const HERO_VICTORY = [
  '...................................kkk..........',
  '.................................kSkbbo.........',
  '......................kkkkk......kSkbbk.........',
  '....................kkkkkkkk.....SSSkbb.........',
  '....................kkkkkkkk.....kkkkbbo........',
  '.................bbkkkkkkkkk......kkkkkb........',
  '..............bbbbbkkbbkbbkk.......okkbbk.......',
  '...........bbbb...bkkkkSSkkk........kbbbo.......',
  '.................bb.kkSSSSSk........kkkSk.......',
  '..............bbb...obSsSsSk....k....SssSo......',
  '..............bb...kkksSSskkkkSSkk...SSssk......',
  '.............kSkkSSWSSSSSSSSWWwSSSkkksSSSS......',
  '.............kkSwwsSSsSSSSSSSssSsSSSSssSsS......',
  '.............SSSswWSSSSSSSSSSWWSSsSsSSsssS......',
  '............kSSSSwWSSsSSSSssSWwSSSsSSSsSsS......',
  '............SSSSSwwSssssssssSswkSSSSssSSSk......',
  '............SSSsSwwSSssSSsSsSswkkSSsSSSkk.......',
  '...........kSSsSWwwsSssSSsSSSwskkokkko..........',
  '..........kSSSSSksssSssSSssSswWSk...............',
  '..........ksSssSkWwsSSSSSSSSwWwWSk..............',
  '..........SssssSkWwWWSSsSsSSwswWk...............',
  '.........ksSsSSSkWwWwSSSSSSsWwwW................',
  '.........SsSSSSkkWwwwSSSSSSwWwWk................',
  '........kssSSkk..kwwsskSSSWwwwWk................',
  '........kSsSSk...SsswWWSSSwswsWk................',
  '........SbsSSk...kSWSWWWSWsWWWS.................',
  '........SSSssk....okkkkkkSkkkk..................',
  '........SssSS.....okkkkkbbbbbko.................',
  '........SssSk.....WwwsSkbkkSWWS.................',
  '........kkkk.....kwwwWkbkkbSwWsk................',
  '.......obbbb....kwwWwsbbWkbWwSWS................',
  '.......obkkk...kWSkWwWbbwSbSwSSWk...............',
  '........kbbkk..SkSSwwSbSwSbSwSWkS...............',
  '.......obbbkSk..kwWSSkbSwSbSwWWWk...............',
  '.......obbbkkk.owwwwWkbkWkbSSSwwS...............',
  '.......obbkkkk.SwwWwwSbkkkbkWwwswk..............',
  '........okkkk.kwWSSSwbbSWkbkwwwsSS..............',
  '.............kWSSSskWbbSSkbkswwwssk.............',
  '.............SkSSSsSwkkSkWWWwwwwswS.............',
  '.............kksSsSSwwWSkWWwWwwwSSS.............',
  '..............kSWSswwWWk.SWwwwwsSsSo............',
  '.............kWwwwwwwWW..kWWwwwSSss.............',
  '.............swwwwwWswS..oSWWwwsSssk............',
  '............kswSwwwwwko...kWWWwwsssS............',
  '...........kWswwwwsWko....kWwWWwwSSwk...........',
  '..........kwwwwwwWWWk.....kSswwwwwswso..........',
  '..........kSwwwwWWWSo.....kkswwwwwwwso..........',
  '..........kkwwwwWWWS.......ksSswwwwsSk..........',
  '..........sSWsswWWWk........SkSwwwsSSsk.........',
  '.........kSsSSSwWwwo........kkSwwwSSSwS.........',
  '.........kSssSswWwwo.........kWWwwSSSssk........',
  '.........ksSSSswwSso.........osWWwwSWwwk........',
  '.........SSSSwwwSoS...........WwWswswwS.........',
  '........SSSSwwwWk.............SSWWwwwwSk........',
  '.......kwSSwwwWWk.............oSwWWwwwws........',
  '.......kWwwwwWWwS..............WwwWWwwwSS.......',
  '........SWwwwsskS.............kswwwwwwWok.......',
  '.......okSkSwwk.o.............kkwwWwwkk.........',
  '........SSSSkSo.................WkoSSSS.........',
  '.......ksSSk....................k..kSSsk........',
  '......kssssk.......................kSsSSk.......',
  '....kSSsssSk.......................kSssSSk......',
  '....kSSSSsk........................oksSSSSk.....',
  '....okkkkk...........................kkkkkk.....',
];

/**
 * Frames du combattant : 0-1 frais en respiration, 2-3 fatigue en respiration,
 * 4 vainqueur. `HERO_FRAME` donne la premiere frame de chaque etat ; on y
 * ajoute l'index de respiration (0 ou 1).
 */
export const HERO = sprite([
  HERO_FRESH,
  breathe(HERO_FRESH, 9),
  HERO_TIRED,
  breathe(HERO_TIRED, 9),
  HERO_VICTORY,
  breathe(HERO_VICTORY, 10),
]);
export const HERO_FRAME = { fresh: 0, tired: 2, victory: 4 } as const;

/** Le cadre du buste, pour les portraits recadres : du bandeau aux poings, sans le vide. */
export const HERO_BUST = { x: 8, y: 0, w: 32, h: 26 } as const;
