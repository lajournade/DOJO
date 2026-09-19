/**
 * Le vrai serveur, sur un port libre et un dossier temporaire : les tests
 * d'integration parlent a la meme API que le telephone, et relisent `sport.json`.
 */
import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile, rm, writeFile, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { AppState } from '../types';
import { createStore } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';

export interface ServeurDeTest {
  /** `http://127.0.0.1:<port>` */
  base: string;
  dossier: string;
  fichier: string;
  store: ReturnType<typeof createStore>;
  /** L'etat tel qu'il est ecrit sur le disque. */
  lireJson(): Promise<AppState>;
  /** Coupe le reseau : les requetes en cours et a venir echouent. */
  arreter(): Promise<void>;
  /** Le VPN revient : meme port, meme etat. */
  redemarrer(): Promise<void>;
  /** Arret et suppression du dossier. */
  fermer(): Promise<void>;
}

const FIXTURES = new URL('../../fixtures/', import.meta.url);

/**
 * @param etat  un etat a ecrire dans `sport.json`, `'seed'` pour partir sans fichier
 *              (le seed du depot est alors migre), `'v1'` pour la fixture mono-joueur.
 */
export async function demarrerServeur(etat: AppState | 'seed' | 'v1' | 'v2' = 'seed'): Promise<ServeurDeTest> {
  const dossier = await mkdtemp(join(tmpdir(), 'dojo-'));
  const fichier = join(dossier, 'sport.json');
  if (etat === 'v1' || etat === 'v2') await cp(new URL(`sport-${etat}.json`, FIXTURES), fichier);
  else if (etat !== 'seed') await writeFile(fichier, JSON.stringify(etat, null, 2));

  const store = createStore({ file: fichier, log: () => {} });
  await store.load();
  const handler = createApp({ store, dist: join(dossier, 'dist') });

  let serveur: Server = createServer(handler);
  await new Promise<void>((ok) => serveur.listen(0, '127.0.0.1', ok));
  const port = (serveur.address() as AddressInfo).port;

  const arreter = () =>
    new Promise<void>((ok) => {
      serveur.closeAllConnections();
      serveur.close(() => ok());
    });

  return {
    base: `http://127.0.0.1:${port}`,
    dossier,
    fichier,
    store,
    lireJson: async () => JSON.parse(await readFile(fichier, 'utf8')) as AppState,
    arreter,
    async redemarrer() {
      serveur = createServer(handler);
      await new Promise<void>((ok) => serveur.listen(port, '127.0.0.1', ok));
    },
    async fermer() {
      if (serveur.listening) await arreter();
      await rm(dossier, { recursive: true, force: true });
    },
  };
}
