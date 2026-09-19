import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, request, type Server } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp, toCsv } from './app.mjs';
import { createStore } from './store.mjs';
import { etat, joueur, journal, serie } from '../src/test/fabrique';

let dossier: string;
let fichier: string;
let base: string;
let serveur: Server;

const P3 = new URL('../scripts/p3-full-body.ops.json', import.meta.url);

beforeAll(async () => {
  dossier = await mkdtemp(join(tmpdir(), 'dojo-app-'));
  fichier = join(dossier, 'sport.json');
  const logs = [
    journal({ date: '2026-09-11', series: [serie('squat-barre', 1, 60, 8), serie('squat-barre', 2, 102.5, 8, 2), serie('dips', 1, null, null)] }),
    journal({ date: '2026-09-12', user: 'u-2', programCode: 'P1-B', series: [{ ...serie('traction', 1, 0, 10, 1), exerciseName: 'Traction; "lestée"' }] }),
  ];
  await writeFile(fichier, JSON.stringify(etat({ users: [joueur(), joueur({ id: 'u-2', name: 'Lisa' })], logs })));
  const store = createStore({ file: fichier, log: () => {} });
  await store.load();
  serveur = createServer(createApp({ store, dist: join(dossier, 'dist') }));
  await new Promise<void>((ok) => serveur.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((ok) => serveur.close(() => ok()));
  await rm(dossier, { recursive: true, force: true });
});

const post = (chemin: string, corps: string) =>
  fetch(base + chemin, { method: 'POST', headers: { 'content-type': 'application/json' }, body: corps });

describe("l'API", () => {
  it("GET /api/state rend l'etat complet, sans cache", async () => {
    const res = await fetch(`${base}/api/state`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const state = await res.json();
    expect(state.users.map((u: { name: string }) => u.name)).toEqual(['Ludo', 'Lisa']);
  });

  it('POST /api/ops applique une salve, la persiste, et ignore son rejeu', async () => {
    const ops = await readFile(P3, 'utf8');
    const avant = (await stat(fichier)).mtimeMs;
    const premiere = await (await post('/api/ops', ops)).json();
    expect(premiere).toEqual({ rev: 4, applied: 4 });
    const disque = JSON.parse(await readFile(fichier, 'utf8'));
    expect(disque.programs.map((p: { code: string }) => p.code)).toEqual(['P1', 'P3']);
    expect(disque.rev).toBe(4);

    const apres = (await stat(fichier)).mtimeMs;
    expect(apres).toBeGreaterThanOrEqual(avant);
    const seconde = await (await post('/api/ops', ops)).json();
    expect(seconde).toEqual({ rev: 4, applied: 0 });
    // Rien d'applique : rien de reecrit.
    expect((await stat(fichier)).mtimeMs).toBe(apres);
  });

  it('refuse ce qui n\'est pas un tableau, et signale un JSON casse', async () => {
    const objet = await post('/api/ops', '{"opId":"x"}');
    expect(objet.status).toBe(400);
    expect(await objet.json()).toEqual({ error: 'tableau attendu' });

    const erreur = console.error;
    console.error = () => {};
    try {
      const casse = await post('/api/ops', '[oops');
      expect(casse.status).toBe(500);
      expect((await casse.json()).error).toMatch(/JSON/);
      const inconnue = await post('/api/ops', JSON.stringify([{ opId: 'z', type: 'boum', payload: {} }]));
      expect(inconnue.status).toBe(500);
      expect((await inconnue.json()).error).toBe('operation inconnue : boum');
    } finally {
      console.error = erreur;
    }
  });

  it('coupe un corps trop volumineux', async () => {
    const erreur = console.error;
    console.error = () => {};
    try {
      const gros = '[' + '"x",'.repeat(1_100_000) + '"x"]';
      const res = await post('/api/ops', gros).catch(() => null);
      // Selon le moment ou la connexion tombe, la requete echoue ou recoit le 500.
      if (res) expect(res.status).toBe(500);
    } finally {
      console.error = erreur;
    }
  });

  it('exporte le journal en CSV au format du tableur, pour tous ou pour un joueur', async () => {
    const res = await fetch(`${base}/api/export.csv`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="dojo-\d{4}-\d{2}-\d{2}\.csv"$/);
    // `text()` avale le BOM : on le verifie sur les octets.
    const octets = Buffer.from(await res.arrayBuffer());
    expect([...octets.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const lignes = octets.toString('utf8').slice(1).split('\r\n');
    expect(lignes[0]).toBe('Utilisateur;Programme;Date;Exercice;Série;Répétitions;Charge (kg);RIR');
    expect(lignes[1]).toBe('Ludo;P1-A;11/09/2026;Squat barre;1;8;60;');
    expect(lignes[2]).toBe('Ludo;P1-A;11/09/2026;Squat barre;2;8;102,5;2');
    expect(lignes[3]).toBe('Ludo;P1-A;11/09/2026;Dips;1;;;');
    expect(lignes[4]).toBe('Lisa;P1-B;12/09/2026;"Traction; ""lestée""";1;10;0;1');
    expect(lignes.at(-1)).toBe('');

    const lisa = await (await fetch(`${base}/api/export.csv?user=u-2`)).text();
    expect(lisa.split('\r\n').filter(Boolean)).toHaveLength(2);
  });

  it('nomme un joueur disparu par son identifiant', () => {
    const csv = toCsv({ users: [], logs: [journal({ date: '2026-01-02', user: 'u-x', series: [serie('dips', 1, 0, 5)] })] }, null);
    expect(csv).toContain('u-x;P1-A;02/01/2026;Dips;1;5;0;');
  });

  it('repond 404 aux routes inconnues de l\'API et 405 aux methodes hors GET/HEAD', async () => {
    const inconnue = await fetch(`${base}/api/rien`);
    expect(inconnue.status).toBe(404);
    expect(await inconnue.json()).toEqual({ error: 'route inconnue' });
    const post_ = await fetch(`${base}/history`, { method: 'DELETE' });
    expect(post_.status).toBe(405);
  });
});

describe("l'application compilee", () => {
  it("dit de compiler tant que dist/ n'existe pas", async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('npm run build');
  });

  it('sert les fichiers, retombe sur index.html pour les routes, et fige les assets', async () => {
    const dist = join(dossier, 'dist');
    await mkdir(join(dist, 'assets'), { recursive: true });
    await writeFile(join(dist, 'index.html'), '<h1>dojo</h1>');
    await writeFile(join(dist, 'assets', 'app.js'), 'export {}');
    await writeFile(join(dist, 'icon.bin'), 'x');

    const index = await fetch(`${base}/`);
    expect(index.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(index.headers.get('cache-control')).toBe('no-cache');
    expect(await index.text()).toBe('<h1>dojo</h1>');
    expect(await (await fetch(`${base}/history`)).text()).toBe('<h1>dojo</h1>');
    expect(await (await fetch(`${base}/assets/absent.js`)).text()).toBe('<h1>dojo</h1>');

    const asset = await fetch(`${base}/assets/app.js`);
    expect(asset.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(asset.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    expect((await fetch(`${base}/icon.bin`)).headers.get('content-type')).toBe('application/octet-stream');

    const head = await fetch(`${base}/`, { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
  });

  it('ne sort jamais de dist/', async () => {
    // Un chemin qui remonte est neutralise : il retombe sur l'index, jamais sur sport.json.
    const res = await new Promise<{ status: number; body: string }>((ok, ko) => {
      const req = request(`${base}/..%2Fsport.json`, (r) => {
        let body = '';
        r.on('data', (c) => (body += c));
        r.on('end', () => ok({ status: r.statusCode ?? 0, body }));
      });
      req.on('error', ko);
      req.end();
    });
    expect(res.status).toBe(200);
    expect(res.body).toBe('<h1>dojo</h1>');
  });
});
