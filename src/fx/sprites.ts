/**
 * Les combattants, en donnees claires plutot qu'en images : chaque frame est un
 * tableau de lignes, un caractere par pixel, `.` pour le transparent, les autres
 * indexant une palette. Rien de binaire dans le depot, une frame se relit et se
 * corrige a la main, et changer d'adversaire ne coute qu'un tableau de couleurs.
 *
 * Le rendu est fait par <Sprite> ; ici on ne produit que la geometrie.
 */

export const SPRITE_W = 24;
export const SPRITE_H = 32;

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
 * Fusion des suites : un sprite 24x32 tombe de 768 rectangles a environ 150.
 * C'est ce qui rend le rendu SVG viable a plusieurs sprites a l'ecran.
 */
function encode(rows: string[]): Run[] {
  const runs: Run[] = [];
  rows.forEach((raw, y) => {
    const row = raw.padEnd(SPRITE_W, '.');
    let x = 0;
    while (x < SPRITE_W) {
      const key = row[x];
      let w = 1;
      while (x + w < SPRITE_W && row[x + w] === key) w += 1;
      if (key !== '.') runs.push({ x, y, w, key });
      x += w;
    }
  });
  return runs;
}

const sprite = (frames: string[][]): Sprite => ({
  w: SPRITE_W,
  h: SPRITE_H,
  frames: frames.map(encode),
});

/**
 * Frame de respiration : une ligne vide inseree en haut, la nuque retiree — la
 * tete s'enfonce d'un pixel dans les epaules, le reste du corps ne bouge pas.
 */
const breathe = (rows: string[], neck: number) => [
  rows[0],
  rows[1],
  rows[0],
  ...rows.slice(2, neck),
  ...rows.slice(neck + 1),
];

/* ------------------------------------------------------------------ palettes */

/** `b` (ceinture, bandeau) et `k` (cheveux) portent l'identite d'un combattant. */
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

export const HERO_PALETTE: Palette = BASE;

/**
 * Un adversaire par seance, obtenu par permutation de palette : c'est le truc des
 * costumes alternatifs des jeux de combat, et chaque seance gagne sa silhouette
 * de couleur pour le prix d'un tableau.
 */
const FOE_PALETTES: Palette[] = [
  { ...BASE, b: '#e01b24', k: '#2a1e3c', W: '#4a4f66' },
  { ...BASE, b: '#29b6d8', k: '#123a4a', W: '#2f4f66', s: '#e0b088', S: '#a87850' },
  { ...BASE, b: '#d84fa0', k: '#3a1c3a', W: '#5a3a5a' },
  { ...BASE, b: '#21c07a', k: '#14342a', W: '#375a4a', s: '#d8ab86', S: '#a07048' },
  { ...BASE, b: '#ffd400', k: '#4a3a10', W: '#6a5a2a' },
];

export const foePalette = (index: number): Palette =>
  FOE_PALETTES[((index % FOE_PALETTES.length) + FOE_PALETTES.length) % FOE_PALETTES.length];

/* -------------------------------------------------------------------- dessins */

// Le heros : karategi, ceinture coloree, de profil vers la droite.
const HERO_IDLE = [
  '........................',
  '........................',
  '.......ooooooo..........',
  '......okkkkkkkoo........',
  '.....okkkkkkkkkko.......',
  '.....okkkkkssssso.......',
  '.....okkksoesssso.......',
  '.....okkssssssSSo.......',
  '......okssssssSo........',
  '......oksssoSSo.........',
  '.......oSSSSSo..........',
  '........ossso...........',
  '......ooowwwooo.........',
  '.....owwwwwwwwwo........',
  '....owwwwwwwwwwwo.......',
  '....owWwwwwwwwwwoo......',
  '....owWwwwwwwwwwsso.....',
  '....owWwwwwwwwwwSSo.....',
  '....owWwwwwwwwwoo.......',
  '.....owWwwwwwwwo........',
  '.....owWwwwwwwwo........',
  '.....obbbbbbbbbo........',
  '.....obbbbbbbbbo........',
  '.....owwwwoowwwo........',
  '.....owwwo..owwwo.......',
  '....owwwo....owwwo......',
  '....owwo......owwo......',
  '...owwo........owwo.....',
  '...owwo........owwo.....',
  '..osso..........osso....',
  '..oSSo..........oSSo....',
  '..oooo..........oooo....',
];

// Le buste avance, le bras se detend, le poing part devant.
const HERO_HIT = [
  '........................',
  '........................',
  '........ooooooo.........',
  '.......okkkkkkkoo.......',
  '......okkkkkkkkkko......',
  '......okkkkkssssso......',
  '......okkksoesssso......',
  '......okkssssssSSo......',
  '.......okssssssSo.......',
  '.......oksssoSSo........',
  '........oSSSSSo.........',
  '.........ossso..........',
  '.......ooowwwooo........',
  '......owwwwwwwwwo.......',
  '.....owwwwwwwwwwwoooooo.',
  '.....owWwwwwwwwwwwwwwwso',
  '.....owWwwwwwwwwwwwwwsso',
  '.....owWwwwwwwwwoooooSSo',
  '.....owWwwwwwwwwo...ooo.',
  '......owWwwwwwwwo.......',
  '......obbbbbbbbbo.......',
  '......obbbbbbbbbo.......',
  '......owwwwoowwwo.......',
  '.....owwwwo..owwwo......',
  '....owwwwo....owwwo.....',
  '...owwwwo......owwo.....',
  '..owwwwo........owwo....',
  '..owwwo.........owwo....',
  '.owwwo...........owwo...',
  '.osso.............osso..',
  '.oSSo.............oSSo..',
  '.oooo.............oooo..',
];

// L'adversaire : plus massif, torse nu, bandeau, de profil vers la gauche.
const FOE_IDLE = [
  '........................',
  '........................',
  '..........ooooooo.......',
  '.........okkkkkkko......',
  '........okkkkkkkkko.....',
  '........obbbbbbbbbo.....',
  '.......ossssseosskko....',
  '.......osssssssskko.....',
  '.......ossSssssko.......',
  '........oSssSSko........',
  '.........oSSSSo.........',
  '..........osso..........',
  '......ooooossoooo.......',
  '.....ossssssssssso......',
  '....osssssssssssssso....',
  '...ossssssssssssssSso...',
  '...osssssssssssssSSso...',
  '...oSssssssssssssSSo....',
  '....oSsssssssssssSo.....',
  '.....oSsssssssssso......',
  '.....oSsssssssssso......',
  '.....obbbbbbbbbbbo......',
  '.....obbbbbbbbbbbo......',
  '.....oWWWooWWWWWo.......',
  '....oWWWo..oWWWWo.......',
  '....oWWo....oWWWo.......',
  '...oWWo......oWWo.......',
  '...oWWo......oWWo.......',
  '..oWWo........oWWo......',
  '..osso........osso......',
  '..oSSo........oSSo......',
  '..oooo........oooo......',
];

// Encaissement : la tete part en arriere, le buste se creuse.
const FOE_HURT = [
  '........................',
  '........................',
  '...........ooooooo......',
  '..........okkkkkkkoo....',
  '..........obbbbbbbbo....',
  '.........osssssssskko...',
  '.........osssoosskkoo...',
  '.........osssssssko.....',
  '..........oSSssko.......',
  '...........oSSSo........',
  '..........osso..........',
  '.........osso...........',
  '......ooooosooooo.......',
  '.....ossssssssssso......',
  '....ossssssssssssso.....',
  '...osssssssssssssSo.....',
  '...osssssssssssssSo.....',
  '...oSssssssssssssSo.....',
  '....oSssssssssssso......',
  '.....oSssssssssso.......',
  '.....oSssssssssso.......',
  '.....obbbbbbbbbbo.......',
  '.....obbbbbbbbbbo.......',
  '.....oWWWooWWWWo........',
  '....oWWWo..oWWWo........',
  '....oWWo....oWWo........',
  '...oWWo......oWWo.......',
  '...oWWo.......oWWo......',
  '..oWWo.........oWWo.....',
  '..osso.........osso.....',
  '..oSSo.........oSSo.....',
  '..oooo.........oooo.....',
];

// K.O. : a terre, en travers du sol.
const FOE_KO = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '..............oooo......',
  '.....ooo.....oWWWWo.....',
  '....osso....oWWWWo......',
  '...osssoooooWWWo........',
  '..okssssssssbbbo........',
  '..okkssssssbbbbo........',
  '..obbbsssssssWWWo.......',
  '..okkoossssssoWWWo......',
  '...ooo.ossssso.oWWo.....',
  '.......ossssSo..osso....',
  '........oSSSo...oSSo....',
  '.........ooo.....oooo...',
  '........................',
  '........................',
  '........................',
  '........................',
];

/** Frames du heros : 0 et 1 en respiration, 2 au moment du coup. */
export const HERO = sprite([HERO_IDLE, breathe(HERO_IDLE, 11), HERO_HIT]);
export const HERO_FRAME = { idle: 0, hit: 2 } as const;

/** Frames de l'adversaire : 0 et 1 en garde, 2 touche, 3 a terre. */
export const FOE = sprite([FOE_IDLE, breathe(FOE_IDLE, 11), FOE_HURT, FOE_KO]);
export const FOE_FRAME = { idle: 0, hurt: 2, ko: 3 } as const;
