import type { SessionLog, UserView } from '../types';

export interface ExerciseProgress {
  exerciseId: string;
  name: string;
  tracking: 'reps' | 'duration';
  first: number | null;
  last: number | null;
  delta: number | null;
  sessions: number;
}

/** Progression entre la premiere et la derniere seance de la periode, inclusivement. */
export function exerciseProgress(state: UserView, start: string, end: string): ExerciseProgress[] {
  if (start > end) return [];

  const byExercise = new Map<string, { logs: { log: SessionLog; value: number | null }[]; name: string }>();
  const tracking = new Map(state.exercises.map((exercise) => [exercise.id, exercise.tracking ?? 'reps']));

  for (const log of state.logs) {
    if (log.date < start || log.date > end) continue;
    const perSession = new Map<string, { value: number | null; name: string }>();
    for (const entry of log.entries) {
      if (entry.reps === 0) continue;
      const timed = tracking.get(entry.exerciseId) === 'duration';
      const rawValue = timed ? entry.seconds ?? entry.reps : entry.weight;
      const value = rawValue !== null && rawValue !== undefined && Number.isFinite(rawValue) ? rawValue : null;
      const current = perSession.get(entry.exerciseId);
      if (!current || (value !== null && (current.value === null || value > current.value))) {
        perSession.set(entry.exerciseId, {
          value,
          name: state.exercises.find((exercise) => exercise.id === entry.exerciseId)?.name ?? entry.exerciseName ?? entry.exerciseId,
        });
      }
    }
    for (const [exerciseId, item] of perSession) {
      const current = byExercise.get(exerciseId) ?? { logs: [], name: item.name };
      current.logs.push({ log, value: item.value });
      byExercise.set(exerciseId, current);
    }
  }

  return [...byExercise].map(([exerciseId, group]) => {
    group.logs.sort((a, b) => a.log.date.localeCompare(b.log.date)
      || (a.log.startedAt ?? '').localeCompare(b.log.startedAt ?? '')
      || a.log.id.localeCompare(b.log.id));
    const first = group.logs[0]?.value ?? null;
    const last = group.logs[group.logs.length - 1]?.value ?? null;
    return {
      exerciseId,
      name: group.name,
      tracking: tracking.get(exerciseId) === 'duration' ? 'duration' as const : 'reps' as const,
      first,
      last,
      delta: group.logs.length < 2 || first === null || last === null ? null : last - first,
      sessions: group.logs.length,
    };
  }).sort((a, b) => {
    const rank = (item: ExerciseProgress) => item.delta === null || item.delta === 0 ? 2 : item.delta > 0 ? 0 : 1;
    const groupOrder = rank(a) - rank(b);
    if (groupOrder) return groupOrder;
    if (a.delta !== null && b.delta !== null && a.delta !== b.delta) return b.delta - a.delta;
    return a.name.localeCompare(b.name, 'fr');
  });
}

