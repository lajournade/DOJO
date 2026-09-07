/** Lectures derivees de l'etat : suggestions de charge, records, agregats d'historique. */
import type { SessionLog, SetEntry, UserView } from '../types';

/** Le programme en cours du joueur : la bibliotheque est commune, le choix ne l'est pas. */
export const activeProgram = (s: UserView) =>
  s.programs.find((p) => p.id === s.user.activeProgramId) ?? s.programs[0] ?? null;

export const exerciseName = (s: UserView, id: string) =>
  s.exercises.find((e) => e.id === id)?.name ?? id;

/** Tonnage d'une liste de series : la somme des charge x repetitions. */
export const tonnage = (entries: SetEntry[]) =>
  entries.reduce((sum, e) => sum + (e.weight ?? 0) * (e.reps ?? 0), 0);

export const doneEntries = (entries: SetEntry[]) =>
  entries.filter((e) => e.reps !== null && e.reps !== undefined);

/** Les seances du journal, de la plus recente a la plus ancienne. */
export const recentLogs = (s: UserView) =>
  [...s.logs].sort((a, b) => b.date.localeCompare(a.date) || (b.startedAt ?? '').localeCompare(a.startedAt ?? ''));

/** Toutes les series d'un exercice, seance par seance, de la plus recente a la plus ancienne. */
export function historyOf(s: UserView, exerciseId: string): { log: SessionLog; entries: SetEntry[] }[] {
  return recentLogs(s)
    .map((log) => ({ log, entries: log.entries.filter((e) => e.exerciseId === exerciseId) }))
    .filter((row) => row.entries.length > 0);
}

/**
 * Ce qui a ete fait sur cette meme serie la derniere fois.
 * C'est la valeur qui pre-remplit les compteurs : dans le cas nominal,
 * une serie se valide sans rien toucher.
 */
export function lastSet(s: UserView, exerciseId: string, setIndex: number): SetEntry | null {
  for (const { entries } of historyOf(s, exerciseId)) {
    const exact = entries.find((e) => e.setIndex === setIndex && e.weight !== null);
    if (exact) return exact;
    // Moins de series la derniere fois : on retombe sur la derniere renseignee.
    const fallback = [...entries].reverse().find((e) => e.weight !== null);
    if (fallback) return fallback;
  }
  return null;
}

/** Meilleure charge jamais soulevee sur un exercice (sert a doser l'impact). */
export function bestWeight(s: UserView, exerciseId: string): number {
  let best = 0;
  for (const log of s.logs) {
    for (const e of log.entries) {
      if (e.exerciseId === exerciseId && (e.weight ?? 0) > best) best = e.weight ?? 0;
    }
  }
  return best;
}

/** Derniere fois qu'une seance du programme a ete jouee. */
export function lastRun(s: UserView, sessionId: string): SessionLog | null {
  return recentLogs(s).find((l) => l.sessionId === sessionId) ?? null;
}

/**
 * Duree mediane des seances deja jouees sur cette seance du programme, en minutes.
 * `startedAt` / `endedAt` ne sont poses que par l'application : les seances importees
 * du classeur n'en ont pas, et une seance oubliee ouverte une nuit entiere n'a rien a
 * dire d'une duree — les deux sont ecartees plutot que moyennees.
 */
export function typicalMinutes(s: UserView, sessionId: string): number | null {
  const durations = s.logs
    .filter((l) => l.sessionId === sessionId && l.startedAt && l.endedAt)
    .map((l) => (Date.parse(l.endedAt as string) - Date.parse(l.startedAt as string)) / 60_000)
    .filter((m) => m >= 5 && m <= 240)
    .sort((a, b) => a - b);
  if (!durations.length) return null;

  const mid = Math.floor(durations.length / 2);
  const median =
    durations.length % 2 ? durations[mid] : (durations[mid - 1] + durations[mid]) / 2;
  return Math.round(median);
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/** "il y a 3 jours", pour situer la derniere seance d'un coup d'oeil. */
export function sinceLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const days = Math.round((Date.now() - new Date(y, m - 1, d).getTime()) / 86_400_000);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return 'hier';
  if (days < 7) return `il y a ${days} j`;
  if (days < 30) return `il y a ${Math.floor(days / 7)} sem.`;
  return `il y a ${Math.floor(days / 30)} mois`;
}

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
