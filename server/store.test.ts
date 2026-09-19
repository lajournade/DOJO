import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from './store.mjs';

const FIXTURES = new URL('../fixtures/', import.meta.url);
const jour = () => new Date().toISOString().slice(0, 10);

let dossier: string;
let fichier: string;

beforeEach(async () => {
  dossier = await mkdtemp(join(tmpdir(), 'dojo-store-'));
  fichier = join(dossier, 'sport.json');
});

afterEach(() => rm(dossier, { recursive: true, force: true }));

const lire = async () => JSON.parse(await readFile(fichier, 'utf8'));

describe('le premier demarrage', () => {
  it("part du seed du depot, le convertit aux profils et l'ecrit", async () => {
    const messages: string[] = [];
    const store = createStore({ file: fichier, log: (m) => messages.push(m) });
    const state = await store.load();
    expect(state.users).toEqual([{ id: 'u-1', name: 'Joueur 1', activeProgramId: 'prog-p2', palette: 0 }]);
    expect(state.programs.every((p: { goal?: string; active?: boolean }) => p.goal === 'hypertrophie' && !('active' in p))).toBe(true);
    expect(state.logs.every((l: { userId?: string }) => l.userId === 'u-1')).toBe(true);
    expect(state.liveSessions).toEqual({});
    expect('liveSession' in state).toBe(false);
    expect(await lire()).toEqual(state);
    expect(messages[0]).toMatch(/etat initialise depuis .*seed\.json/);
    // Le seed n'est pas un fichier d'avant : rien a archiver.
    expect(existsSync(join(dossier, 'backups'))).toBe(false);
  });

  it('part de zero quand il n\'y a pas de seed', async () => {
    const store = createStore({ file: fichier, seed: join(dossier, 'absent.json'), log: () => {} });
    expect(await store.load()).toMatchObject({ rev: 0, users: [], programs: [], logs: [], liveSessions: {} });
    expect(existsSync(fichier)).toBe(true);
  });

  it('refuse de servir avant le chargement, et ne charge qu\'une fois', async () => {
    const store = createStore({ file: fichier, log: () => {} });
    expect(() => store.get()).toThrow('store non charge');
    const a = await store.load();
    expect(await store.load()).toBe(a);
    expect(store.get()).toBe(a);
  });
});

describe('la migration d\'un fichier d\'avant les profils', () => {
  it('archive le fichier d\'origine puis convertit tout au premier joueur', async () => {
    await cp(new URL('sport-v1.json', FIXTURES), fichier);
    const store = createStore({ file: fichier, log: () => {} });
    const state = await store.load();
    expect(state.users[0]).toMatchObject({ id: 'u-1', activeProgramId: 'prog-p1' });
    expect(state.programs[0].goal).toBe('hypertrophie');
    expect(state.programs[0].active).toBeUndefined();
    expect(state.logs[0].userId).toBe('u-1');
    expect(state.liveSessions['u-1']).toMatchObject({ id: 'log-2026-08-31-a', userId: 'u-1' });
    expect(state.liveSession).toBeUndefined();

    const archive = join(dossier, 'backups', `sport-v1-${jour()}.json`);
    expect(JSON.parse(await readFile(archive, 'utf8')).liveSession).toBeDefined();
    expect(await lire()).toEqual(state);
  });

  it("ne touche pas a un fichier deja migre", async () => {
    await cp(new URL('sport-v2.json', FIXTURES), fichier);
    const avant = await readFile(fichier, 'utf8');
    const store = createStore({ file: fichier, log: () => {} });
    await store.load();
    expect(await readFile(fichier, 'utf8')).toBe(avant);
    expect(existsSync(join(dossier, 'backups'))).toBe(false);
  });

  it("n'archive pas deux fois le meme jour", async () => {
    await cp(new URL('sport-v1.json', FIXTURES), fichier);
    await createStore({ file: fichier, log: () => {} }).load();
    await writeFile(fichier, JSON.stringify({ rev: 0, programs: [], logs: [] }));
    await createStore({ file: fichier, log: () => {} }).load();
    const archive = JSON.parse(await readFile(join(dossier, 'backups', `sport-v1-${jour()}.json`), 'utf8'));
    expect(archive.rev).toBe(3);
  });
});

describe('save', () => {
  it("ecrit l'etat courant sans laisser de fichier temporaire, meme sur des appels concurrents", async () => {
    const store = createStore({ file: fichier, seed: 'nulle-part', log: () => {} });
    const state = await store.load();
    state.rev = 1;
    const a = store.save();
    state.rev = 2;
    const b = store.save();
    await Promise.all([a, b]);
    expect((await lire()).rev).toBe(2);
    expect((await readdir(dossier)).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it("avale une erreur d'ecriture plutot que de faire tomber le serveur", async () => {
    const store = createStore({ file: fichier, seed: 'nulle-part', log: () => {} });
    await store.load();
    await rm(dossier, { recursive: true, force: true });
    const erreur = console.error;
    const vus: unknown[] = [];
    console.error = (...args: unknown[]) => void vus.push(args[0]);
    try {
      await store.save();
    } finally {
      console.error = erreur;
    }
    expect(vus[0]).toBe('[dojo] echec de sauvegarde');
  });
});

describe('backup', () => {
  it('copie une fois par jour et garde les `keep` plus recentes', async () => {
    const store = createStore({ file: fichier, seed: 'nulle-part', keep: 3, log: () => {} });
    await store.load();
    const backups = join(dossier, 'backups');
    await store.backup();
    await store.backup();
    expect(await readdir(backups)).toEqual([`sport-${jour()}.json`]);

    // Des sauvegardes anciennes, plus une archive v1 qui ne compte pas dans la rotation.
    for (const d of ['2020-01-01', '2020-01-02', '2020-01-03', '2020-01-04']) await writeFile(join(backups, `sport-${d}.json`), '{}');
    await writeFile(join(backups, 'sport-v1-2020-01-01.json'), '{}');
    await rm(join(backups, `sport-${jour()}.json`));
    await store.backup();
    expect((await readdir(backups)).sort()).toEqual(['sport-2020-01-03.json', 'sport-2020-01-04.json', `sport-${jour()}.json`, 'sport-v1-2020-01-01.json']);
  });

  it("ne fait rien sans fichier d'etat", async () => {
    const store = createStore({ file: fichier, log: () => {} });
    await store.backup();
    expect(existsSync(join(dossier, 'backups'))).toBe(false);
  });
});
