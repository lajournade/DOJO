/**
 * File d'operations en attente d'envoi.
 * Persistee dans localStorage : fermer l'application ou perdre le VPN en pleine
 * seance ne fait rien perdre — la file repart au prochain lancement.
 */
import type { Op } from '../types';

const KEY = 'dojo.queue.v1';

function read(): Op[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Op[]) : [];
  } catch {
    return [];
  }
}

function write(ops: Op[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ops));
  } catch {
    // Quota plein ou mode prive : la seance continue, la synchronisation se fera au retour reseau.
  }
}

export const queue = {
  all: read,
  push(op: Op) {
    write([...read(), op]);
  },
  /** Retire les operations confirmees par le serveur, en preservant celles ajoutees entre-temps. */
  drop(sent: Op[]) {
    const sentIds = new Set(sent.map((o) => o.opId));
    write(read().filter((o) => !sentIds.has(o.opId)));
  },
  clear() {
    write([]);
  },
  get size() {
    return read().length;
  },
};
