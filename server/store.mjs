/**
 * Persistance de l'etat : un seul fichier JSON, ecrit de facon atomique.
 * Quelques joueurs, quelques milliers de series par an — un fichier suffit,
 * il se sauvegarde avec un `cp` et se lit avec n'importe quel editeur.
 */
import { readFile, writeFile, rename, mkdir, readdir, unlink, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const DATA_FILE = process.env.DOJO_DATA ?? join(ROOT, 'data', 'sport.json');
const BACKUP_DIR = join(dirname(DATA_FILE), 'backups');
const SEED_FILE = join(ROOT, 'scripts', 'seed.json');
const KEEP_BACKUPS = 14;

/** Le joueur qu'on invente en reprenant un etat d'avant les profils. */
const FIRST_USER = 'u-1';

let state = null;
/** Les ecritures s'enchainent sur cette promesse : jamais deux writeFile concurrents. */
let writeChain = Promise.resolve();

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

/** Le fichier d'avant la conversion, garde de cote : la sauvegarde du jour arrive trop tard. */
async function archiveV1() {
  await mkdir(BACKUP_DIR, { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  const target = join(BACKUP_DIR, `sport-v1-${day}.json`);
  if (existsSync(target)) return;
  await copyFile(DATA_FILE, target);
  console.log(`[dojo] etat mono-joueur archive dans ${target}`);
}

export async function load() {
  if (state) return state;
  await mkdir(dirname(DATA_FILE), { recursive: true });

  const fresh = !existsSync(DATA_FILE);
  if (fresh) {
    // Premier demarrage : on part de l'historique importe du classeur.
    state = existsSync(SEED_FILE) ? JSON.parse(await readFile(SEED_FILE, 'utf8')) : emptyState();
    console.log(`[dojo] etat initialise depuis ${existsSync(SEED_FILE) ? 'scripts/seed.json' : 'zero'}`);
  } else {
    state = JSON.parse(await readFile(DATA_FILE, 'utf8'));
  }

  const converted = migrate(state);
  if (converted && !fresh) await archiveV1();
  if (converted || fresh) await persist();

  return state;
}

export function get() {
  if (!state) throw new Error('store non charge');
  return state;
}

/** Ecriture atomique : fichier temporaire puis rename (jamais de JSON tronque). */
async function persist() {
  const snapshot = JSON.stringify(state, null, 2);
  const tmp = `${DATA_FILE}.${process.pid}.tmp`;
  await writeFile(tmp, snapshot, 'utf8');
  await rename(tmp, DATA_FILE);
}

export function save() {
  writeChain = writeChain.then(persist).catch((err) => {
    console.error('[dojo] echec de sauvegarde', err);
  });
  return writeChain;
}

/** Une copie datee par jour, les 14 dernieres conservees. */
export async function backup() {
  if (!existsSync(DATA_FILE)) return;
  await mkdir(BACKUP_DIR, { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  const target = join(BACKUP_DIR, `sport-${day}.json`);
  if (existsSync(target)) return;
  await copyFile(DATA_FILE, target);
  const old = (await readdir(BACKUP_DIR)).filter((f) => f.startsWith('sport-20')).sort();
  await Promise.all(old.slice(0, -KEEP_BACKUPS).map((f) => unlink(join(BACKUP_DIR, f))));
}
