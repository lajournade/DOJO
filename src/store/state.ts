/**
 * Etat de l'application.
 *
 * Principe : toute mutation passe par `dispatch`, qui applique l'operation
 * localement (l'interface ne bloque jamais) puis la depose dans la file d'envoi.
 * Le serveur rejoue la meme operation via le module partage `shared/ops.mjs`,
 * donc client et serveur ne peuvent pas diverger.
 *
 * L'etat porte tous les joueurs, mais les ecrans n'en voient qu'un : `view()`
 * en tire une `UserView` — le journal et la seance en cours du profil choisi.
 * Les selecteurs n'ont ainsi jamais a se demander de qui ils parlent.
 */
import { useSyncExternalStore } from 'react';
import { applyOp } from '../../shared/ops.mjs';
import type { AppState, Op, OpType, User, UserView } from '../types';
import { queue } from './queue';

export type SyncStatus = 'idle' | 'syncing' | 'offline';

/** Le profil choisi est un reglage d'appareil : il ne part pas dans la file. */
const CURRENT_KEY = 'dojo.user.v1';

const emptyState: AppState = {
  rev: 0,
  appliedOps: [],
  exercises: [],
  programs: [],
  users: [],
  logs: [],
  liveSessions: {},
};

/** Le joueur de repli, le temps qu'un profil soit choisi : l'ecran Players passe avant. */
const NOBODY: User = { id: '', name: '', activeProgramId: null, palette: 0 };

let state: AppState = emptyState;
let status: SyncStatus = 'idle';
let pending = 0;
let loaded = false;
let currentUserId: string | null = readCurrentUser();

function readCurrentUser(): string | null {
  try {
    return localStorage.getItem(CURRENT_KEY);
  } catch {
    // Mode prive : le profil se redemandera a chaque ouverture, rien de plus.
    return null;
  }
}

const listeners = new Set<() => void>();
interface Snapshot {
  /** L'etat du joueur courant : c'est lui que lisent les ecrans. */
  state: UserView;
  /** Tous les joueurs — seul l'ecran de selection en a besoin. */
  users: User[];
  status: SyncStatus;
  pending: number;
  loaded: boolean;
  /** Nul tant qu'aucun profil n'a ete choisi sur cet appareil. */
  userId: string | null;
}

/** La vue du joueur courant, refaite a chaque emission. */
function view(): UserView {
  const user = state.users.find((u) => u.id === currentUserId) ?? null;
  return {
    rev: state.rev,
    user: user ?? NOBODY,
    exercises: state.exercises,
    programs: state.programs,
    logs: user ? state.logs.filter((l) => l.userId === user.id) : [],
    liveSession: (user && state.liveSessions[user.id]) || null,
  };
}

/** Un objet unique par version, pour que useSyncExternalStore detecte le changement. */
let snapshot: Snapshot = {
  state: view(),
  users: state.users,
  status,
  pending,
  loaded,
  userId: currentUserId,
};

function emit() {
  snapshot = { state: view(), users: state.users, status, pending, loaded, userId: currentUserId };
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

/** L'etat ramene au joueur courant, hors composant (demarrage de seance). */
export const getView = () => view();

export const getCurrentUserId = () => currentUserId;

/** Change de joueur sur cet appareil. Aucune donnee ne bouge, seul le regard change. */
export function setCurrentUser(id: string | null) {
  try {
    if (id) localStorage.setItem(CURRENT_KEY, id);
    else localStorage.removeItem(CURRENT_KEY);
  } catch {
    // Quota plein ou mode prive : le choix vaut au moins pour cette session.
  }
  currentUserId = id;
  emit();
}

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

/**
 * Applique une operation localement, puis l'ajoute a la file d'envoi.
 * Le joueur courant est pose d'office sur chaque operation — les operations de
 * seance ne touchent que son sous-arbre —, et reste surchargeable pour celles
 * qui parlent d'un autre joueur (l'ecran de selection).
 */
export function dispatch(type: OpType, payload: Record<string, unknown> = {}): Op {
  const op: Op = { opId: newOpId(), type, payload: { userId: currentUserId, ...payload } };
  // On travaille sur une copie superficielle : React voit une nouvelle racine.
  const next: AppState = { ...state, appliedOps: [...state.appliedOps, op.opId], rev: state.rev + 1 };
  applyOp(next, op);
  state = next;
  queue.push(op);
  emit();
  scheduleFlush?.();
  return op;
}
