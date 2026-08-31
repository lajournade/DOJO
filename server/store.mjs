/**
 * Persistance de l'etat : un seul fichier JSON, ecrit de facon atomique.
 * Mono-utilisateur, quelques milliers de series par an — un fichier suffit,
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

let state = null;
/** Les ecritures s'enchainent sur cette promesse : jamais deux writeFile concurrents. */
let writeChain = Promise.resolve();

const emptyState = () => ({
  rev: 0,
  appliedOps: [],
  exercises: [],
  programs: [],
  logs: [],
  liveSession: null,
});

export async function load() {
  if (state) return state;
  await mkdir(dirname(DATA_FILE), { recursive: true });
  if (existsSync(DATA_FILE)) {
    state = JSON.parse(await readFile(DATA_FILE, 'utf8'));
  } else {
    // Premier demarrage : on part de l'historique importe du classeur.
    state = existsSync(SEED_FILE) ? JSON.parse(await readFile(SEED_FILE, 'utf8')) : emptyState();
    await persist();
    console.log(`[dojo] etat initialise depuis ${existsSync(SEED_FILE) ? 'scripts/seed.json' : 'zero'}`);
  }
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
  const old = (await readdir(BACKUP_DIR)).filter((f) => f.startsWith('sport-')).sort();
  await Promise.all(old.slice(0, -KEEP_BACKUPS).map((f) => unlink(join(BACKUP_DIR, f))));
}
