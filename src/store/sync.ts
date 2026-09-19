/**
 * Synchronisation avec le serveur.
 *
 * L'application n'attend jamais le reseau : les operations partent en arriere-plan
 * et sont rejouees tant qu'elles n'ont pas ete confirmees. Si le VPN tombe en
 * pleine seance, les series continuent de s'enregistrer et remontent au retour.
 */
import { applyOp } from '../../shared/ops.mjs';
import type { AppState, Op } from '../types';
import { queue } from './queue';
import { getState, setFlushScheduler, setState, setStatus } from './state';

const RETRY_MIN = 2_000;
const RETRY_MAX = 30_000;

let retryDelay = RETRY_MIN;
let retryTimer: number | undefined;
let flushing = false;

async function fetchState(): Promise<AppState> {
  const res = await fetch('/api/state', { cache: 'no-store' });
  if (!res.ok) throw new Error(`GET /api/state : ${res.status}`);
  return (await res.json()) as AppState;
}

function scheduleRetry(task: () => Promise<unknown> = flush) {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    void task();
  }, retryDelay) as unknown as number;
  retryDelay = Math.min(retryDelay * 2, RETRY_MAX);
}

/** Envoie la file en une salve. Le serveur ignore les operations deja appliquees. */
export async function flush(): Promise<boolean> {
  if (flushing) return false;
  const ops = queue.all();
  if (!ops.length) {
    setStatus('idle', 0);
    return true;
  }
  flushing = true;
  setStatus('syncing', ops.length);
  try {
    const res = await fetch('/api/ops', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(ops),
    });
    if (!res.ok) throw new Error(`POST /api/ops : ${res.status}`);
    queue.drop(ops);
    retryDelay = RETRY_MIN;
    setStatus(queue.size ? 'syncing' : 'idle');
  } catch {
    setStatus('offline', queue.size);
    scheduleRetry();
    return false;
  } finally {
    flushing = false;
  }
  // Ce qui s'est ajoute pendant l'envoi part aussitot — une fois le garde leve.
  if (queue.size) void flush();
  return true;
}

/** Recharge l'etat serveur, en preservant les operations locales pas encore confirmees. */
export async function pull(): Promise<boolean> {
  try {
    const server = await fetchState();
    // Les operations encore en file ne sont pas dans l'etat serveur : on les rejoue par-dessus.
    for (const op of queue.all()) applyOp(server, op);
    setState(server);
    setStatus(queue.size ? 'syncing' : 'idle');
    return true;
  } catch {
    setStatus('offline', queue.size);
    return false;
  }
}

/** Demarrage : on pousse d'abord ce qui attend, puis on recupere l'etat de reference. */
export async function boot() {
  await flush();
  const ok = await pull();
  if (!ok) {
    // Serveur injoignable au lancement : on repart au moins avec ce qu'on avait localement,
    // et l'on reessaie le demarrage entier — l'etat de reference n'est pas encore la.
    setState(getState());
    scheduleRetry(boot);
  }
}

/** Branche les envois sur les mutations et les reveils. Renvoie de quoi tout debrancher. */
export function startSyncDaemon(): () => void {
  // Une salve par rafale de mutations : valider quatre series d'affilee ne fait qu'un envoi.
  let debounce: number | undefined;
  setFlushScheduler(() => {
    clearTimeout(debounce);
    debounce = setTimeout(() => void flush(), 250) as unknown as number;
  });

  const wake = () => {
    if (document.visibilityState !== 'visible') return;
    retryDelay = RETRY_MIN;
    // La file d'abord ; une fois passee, l'etat de reference — il a pu manquer au lancement.
    if (queue.size) void flush().then((ok) => ok && pull());
    else void pull();
  };
  // Dernier envoi opportuniste quand l'onglet passe en arriere-plan.
  const farewell = () => {
    const ops: Op[] = queue.all();
    if (ops.length && navigator.sendBeacon) {
      navigator.sendBeacon('/api/ops', new Blob([JSON.stringify(ops)], { type: 'application/json' }));
    }
  };
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('online', wake);
  window.addEventListener('pagehide', farewell);

  return () => {
    clearTimeout(debounce);
    setFlushScheduler(() => {});
    document.removeEventListener('visibilitychange', wake);
    window.removeEventListener('online', wake);
    window.removeEventListener('pagehide', farewell);
  };
}
