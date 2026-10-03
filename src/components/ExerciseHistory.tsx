/** Vue partagee de la progression et des seances d'un exercice. */
import { useMemo, useState } from 'react';
import { ProgressChart, type Point } from './ProgressChart';
import { formatDate, historyOf, recentLogs } from '../store/selectors';
import { useStore } from '../store/state';

export function ExerciseHistory({ initialExerciseId = '' }: { initialExerciseId?: string }) {
  const { state } = useStore();
  // Ne construire l'index qu'au montage. Depuis l'arene, le composant n'est monte
  // qu'apres l'appui sur « historique ».
  const seen = useMemo(() => {
    const ids: string[] = [];
    for (const log of recentLogs(state)) {
      for (const entry of log.entries) if (!ids.includes(entry.exerciseId)) ids.push(entry.exerciseId);
    }
    return ids.map((id) => ({
      id,
      name:
        state.exercises.find((exercise) => exercise.id === id)?.name ??
        state.logs.flatMap((log) => log.entries).find((entry) => entry.exerciseId === id)?.exerciseName ??
        id,
    }));
  }, [state]);

  const options = useMemo(() => {
    if (!initialExerciseId || seen.some((exercise) => exercise.id === initialExerciseId)) return seen;
    const current = state.exercises.find((exercise) => exercise.id === initialExerciseId);
    return [{ id: initialExerciseId, name: current?.name ?? initialExerciseId }, ...seen];
  }, [initialExerciseId, seen, state.exercises]);

  const [selection, setSelected] = useState(initialExerciseId || seen[0]?.id || '');
  const selectedIndex = Math.max(0, options.findIndex((exercise) => exercise.id === selection));
  const selected = options[selectedIndex]?.id ?? '';
  if (selection !== selected) setSelected(selected);

  const rows = useMemo(() => (selected ? historyOf(state, selected) : []), [state, selected]);
  const points: Point[] = useMemo(
    () =>
      [...rows]
        .reverse()
        .map(({ log, entries }) => ({
          date: log.date,
          label: formatDate(log.date).replace(/\.$/, ''),
          value: Math.max(0, ...entries.filter((entry) => entry.reps !== 0).map((entry) =>
            state.exercises.find((exercise) => exercise.id === selected)?.tracking === 'duration'
              ? entry.seconds ?? entry.reps ?? 0
              : entry.weight ?? 0)),
        }))
        .filter((point) => point.value > 0),
    [rows],
  );

  if (!options.length) {
    return <p className="py-8 text-center text-p2 text-ash">Aucune série enregistrée.</p>;
  }

  return (
    <div>
      <label className="fight-text text-p1 tracking-[0.2em] text-ash" htmlFor="history-exercise">
        exercice
      </label>
      <div className="mt-2 flex items-stretch gap-2">
        <ExerciseArrow
          direction="previous"
          disabled={selectedIndex === 0}
          onClick={() => setSelected(options[selectedIndex - 1].id)}
        />
        <select
          id="history-exercise"
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
          className="bevel-in min-w-0 flex-1 appearance-none bg-ink-3 px-3 py-3 text-bone focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-impact"
        >
          {options.map((exercise) => (
            <option key={exercise.id} value={exercise.id}>{exercise.name}</option>
          ))}
        </select>
        <ExerciseArrow
          direction="next"
          disabled={selectedIndex === options.length - 1}
          onClick={() => setSelected(options[selectedIndex + 1].id)}
        />
      </div>

      <div className="bevel-sm mt-3 bg-ink-2 p-2 pt-3">
        <ProgressChart key={selected} points={points}
          unit={state.exercises.find((e) => e.id === selected)?.tracking === 'duration' ? 's' : 'kg'}
          metricLabel={state.exercises.find((e) => e.id === selected)?.tracking === 'duration' ? 'durée par séance' : 'charge maximale par séance'} />
      </div>

      <div className="mt-3 grid gap-2">
        {rows.map(({ log, entries }) => (
          <div key={log.id} className="bevel-sm bg-ink-2 p-3">
            <div className="flex items-baseline justify-between">
              <p className="numeric text-p2 text-bone">{formatDate(log.date)}</p>
              <p className="fight-text text-p1 text-impact">{log.programCode}</p>
            </div>
            <p className="numeric mt-1 text-p2 text-ash">
              {entries
                .map((entry) => entry.reps === 0 ? 'abandonné' : state.exercises.find((e) => e.id === entry.exerciseId)?.tracking === 'duration'
                  ? `${entry.seconds ?? entry.reps ?? '—'} s`
                  : `${entry.reps ?? '—'}×${entry.weight ?? '—'}kg${entry.rir !== null ? ` (rir ${entry.rir})` : ''}`)
                .join('  ·  ')}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExerciseArrow({ direction, disabled, onClick }: {
  direction: 'previous' | 'next';
  disabled: boolean;
  onClick: () => void;
}) {
  const previous = direction === 'previous';
  return (
    <button
      type="button"
      aria-label={previous ? 'Exercice précédent' : 'Exercice suivant'}
      disabled={disabled}
      onClick={onClick}
      className={`bevel-sm flex min-h-12 w-12 shrink-0 items-center justify-center
        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-impact ${
          disabled
            ? 'cursor-not-allowed bg-ink-2 text-ash opacity-40'
            : 'keycap cursor-pointer bg-ink-3 text-impact active:bg-blood'
        }`}
    >
      <svg aria-hidden="true" viewBox="0 0 16 16" width="24" height="24" shapeRendering="crispEdges">
        <path
          fill="currentColor"
          transform={previous ? undefined : 'translate(16 0) scale(-1 1)'}
          d="M8 2h2v4h4v4h-4v4H8v-2H6v-2H4V6h2V4h2Z"
        />
      </svg>
    </button>
  );
}
