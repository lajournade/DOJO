/**
 * Etat de l'application.
 *
 * Principe : toute mutation passe par `dispatch`, qui applique l'operation
 * localement (l'interface ne bloque jamais) puis la depose dans la file d'envoi.
 * Le serveur rejoue la meme operation via le module partage `shared/ops.mjs`,
 * donc client et serveur ne peuvent pas diverger.
 */
import { useSyncExternalStore } from 'react';
import { applyOp } from '../../shared/ops.mjs';
import type { AppState, Op, OpType } from '../types';
import { queue } from './queue';

export type SyncStatus = 'idle' | 'syncing' | 'offline';

const emptyState: AppState = {
  rev: 0,
  appliedOps: [],
  exercises: [],
  programs: [],
  logs: [],
  liveSession: null,
};

let state: AppState = emptyState;
let status: SyncStatus = 'idle';
let pending = 0;
let loaded = false;

const listeners = new Set<() => void>();
interface Snapshot {
  state: AppState;
  status: SyncStatus;
  pending: number;
  loaded: boolean;
}

/** Un objet unique par version, pour que useSyncExternalStore detecte le changement. */
let snapshot: Snapshot = { state, status, pending, loaded };

function emit() {
  snapshot = { state, status, pending, loaded };
  listeners.forEach((l) => l());
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const getSnapshot = () => snapshot;

export function useStore() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function setState(next: AppState) {
  state = next;
  loaded = true;
  emit();
}

export function setStatus(next: SyncStatus, pendingCount = queue.size) {
  status = next;
  pending = pendingCount;
  emit();
}

export const getState = () => state;

/**
 * Declenche l'envoi apres une mutation. Branche par le module de synchronisation
 * (`setFlushScheduler`) plutot qu'importe directement : state.ts ne doit pas
 * dependre de sync.ts, qui depend deja de lui.
 */
let scheduleFlush: (() => void) | null = null;

export function setFlushScheduler(fn: () => void) {
  scheduleFlush = fn;
}

const newOpId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Applique une operation localement, puis l'ajoute a la file d'envoi. */
export function dispatch(type: OpType, payload: Record<string, unknown> = {}): Op {
  const op: Op = { opId: newOpId(), type, payload };
  // On travaille sur une copie superficielle : React voit une nouvelle racine.
  const next: AppState = { ...state, appliedOps: [...state.appliedOps, op.opId], rev: state.rev + 1 };
  applyOp(next, op);
  state = next;
  queue.push(op);
  emit();
  scheduleFlush?.();
  return op;
}
