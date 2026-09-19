/**
 * Persistance de l'etat : un seul fichier JSON, ecrit de facon atomique.
 * Quelques joueurs, quelques milliers de series par an — un fichier suffit,
 * il se sauvegarde avec un `cp` et se lit avec n'importe quel editeur.
 *
 * `createStore` rend le fichier, le seed et la rotation parametrables : le serveur
 * n'en cree qu'un, les tests en ouvrent autant qu'ils ont de dossiers temporaires.
 */
import { readFile, writeFile, rename, mkdir, readdir, unlink, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/** Le joueur qu'on invente en reprenant un etat d'avant les profils. */
const FIRST_USER = 'u-1';

const emptyState = () => ({
  rev: 0,
  appliedOps: [],
  exercises: [],
  programs: [],
  users: [],
  logs: [],
  liveSessions: {},
});

/**
 * Passage de l'etat mono-joueur a l'etat multi-joueurs.
 *
 * L'etat d'origine n'avait ni `users` ni `liveSessions`, et le programme en cours
 * etait marque sur le programme lui-meme. Tout ce qui existait appartient au
 * premier joueur ; les programmes rejoignent la categorie la plus courante, a
 * corriger d'un geste dans l'editeur. Renvoie vrai si quelque chose a bouge.
 */
function migrate(s) {
  if (Array.isArray(s.users) && s.liveSessions) return false;

  const active = s.programs?.find((p) => p.active);
  s.users = [
    {
      id: FIRST_USER,
      name: 'Joueur 1',
      activeProgramId: active?.id ?? s.programs?.[0]?.id ?? null,
      palette: 0,
    },
  ];

  for (const log of s.logs ?? []) if (!log.userId) log.userId = FIRST_USER;

  s.liveSessions = {};
  if (s.liveSession) {
    s.liveSession.userId = FIRST_USER;
    s.liveSessions[FIRST_USER] = s.liveSession;
  }
  delete s.liveSession;

  for (const program of s.programs ?? []) {
    if (!program.goal) program.goal = 'hypertrophie';
    delete program.active;
  }

  return true;
}

/**
 * @param {object} [options]
 * @param {string} [options.file]  le fichier d'etat (`DOJO_DATA` cote serveur)
 * @param {string} [options.seed]  l'etat initial si le fichier n'existe pas
 * @param {number} [options.keep]  nombre de sauvegardes datees conservees
 * @param {(message: string) => void} [options.log]
 */
export function createStore({
  file = join(ROOT, 'data', 'sport.json'),
  seed = join(ROOT, 'scripts', 'seed.json'),
  keep = 14,
  log = console.log,
} = {}) {
  const backupDir = join(dirname(file), 'backups');

  let state = null;
  /** Les ecritures s'enchainent sur cette promesse : jamais deux writeFile concurrents. */
  let writeChain = Promise.resolve();

  /** Le fichier d'avant la conversion, garde de cote : la sauvegarde du jour arrive trop tard. */
  async function archiveV1() {
    await mkdir(backupDir, { recursive: true });
    const day = new Date().toISOString().slice(0, 10);
    const target = join(backupDir, `sport-v1-${day}.json`);
    if (existsSync(target)) return;
    await copyFile(file, target);
    log(`[dojo] etat mono-joueur archive dans ${target}`);
  }

  async function load() {
    if (state) return state;
    await mkdir(dirname(file), { recursive: true });

    const fresh = !existsSync(file);
    if (fresh) {
      // Premier demarrage : on part de l'historique importe du classeur.
      state = existsSync(seed) ? JSON.parse(await readFile(seed, 'utf8')) : emptyState();
      log(`[dojo] etat initialise depuis ${existsSync(seed) ? seed : 'zero'}`);
    } else {
      state = JSON.parse(await readFile(file, 'utf8'));
    }

    const converted = migrate(state);
    if (converted && !fresh) await archiveV1();
    if (converted || fresh) await persist();

    return state;
  }

  function get() {
    if (!state) throw new Error('store non charge');
    return state;
  }

  /** Ecriture atomique : fichier temporaire puis rename (jamais de JSON tronque). */
  async function persist() {
    const snapshot = JSON.stringify(state, null, 2);
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, snapshot, 'utf8');
    await rename(tmp, file);
  }

  function save() {
    writeChain = writeChain.then(persist).catch((err) => {
      console.error('[dojo] echec de sauvegarde', err);
    });
    return writeChain;
  }

  /** Une copie datee par jour, les `keep` dernieres conservees. */
  async function backup() {
    if (!existsSync(file)) return;
    await mkdir(backupDir, { recursive: true });
    const day = new Date().toISOString().slice(0, 10);
    const target = join(backupDir, `sport-${day}.json`);
    if (existsSync(target)) return;
    await copyFile(file, target);
    const old = (await readdir(backupDir)).filter((f) => f.startsWith('sport-20')).sort();
    await Promise.all(old.slice(0, -keep).map((f) => unlink(join(backupDir, f))));
  }

  return { file, backupDir, load, get, save, backup };
}
