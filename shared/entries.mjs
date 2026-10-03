/** Identité d’une occurrence ; les anciens journaux ne portent que l’exercice. */
export const entryMatchesStep = (entry, step) => entry.itemId
  ? entry.itemId === step.id
  : entry.exerciseId === step.exerciseId;

export const isAbandoned = (entries, step) =>
  entries.some((entry) => entry.reps === 0 && entryMatchesStep(entry, step));

export const isDone = (entry) => (entry.reps ?? 0) > 0 || (entry.seconds ?? 0) > 0;

export const abandonedCount = (entries) => new Set(entries
  .filter((entry) => entry.reps === 0)
  .map((entry) => entry.itemId ? `item:${entry.itemId}` : `exercise:${entry.exerciseId}`)).size;
