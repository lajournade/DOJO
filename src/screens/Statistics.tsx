import { useMemo, useState } from 'react';
import { navigate } from '../router';
import { exerciseProgress } from '../store/statistics';
import { todayIso } from '../store/selectors';
import { useStore } from '../store/state';

const initialStart = () => {
  const date = new Date();
  date.setDate(date.getDate() - 30);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export function Statistics() {
  const { state } = useStore();
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(todayIso);
  const rows = useMemo(() => exerciseProgress(state, start, end), [state, start, end]);
  const invalid = start > end;

  return (
    <div className="min-h-dvh bg-ink">
      <header className="pad-top pad-x pb-3">
        <button type="button" onClick={() => navigate('/')}
          className="tap-target fight-text text-p1 tracking-[0.2em] text-ash">← dojo</button>
        <h1 className="fight-text fight-shadow text-p3 text-bone">statistiques</h1>
      </header>

      <main className="pad-x pad-bottom">
        <section className="bevel-sm grid grid-cols-2 gap-2 bg-ink-2 p-3">
          <DateField id="stats-start" label="début" value={start} max={end} onChange={setStart} />
          <DateField id="stats-end" label="fin" value={end} min={start} max={todayIso()} onChange={setEnd} />
        </section>

        {invalid ? <p role="alert" className="py-8 text-center text-p2 text-impact">La date de début doit précéder la date de fin.</p>
          : !rows.length ? <p className="py-8 text-center text-p2 text-ash">Aucun exercice enregistré sur cette période.</p>
            : <div className="mt-3 grid gap-2">{rows.map((row) => {
              const unit = row.tracking === 'duration' ? 's' : 'kg';
              const change = row.delta === null ? 'pas assez de données'
                : row.delta === 0 ? 'pas de progression'
                  : `${row.delta > 0 ? '+' : '−'}${formatValue(Math.abs(row.delta), row.tracking)} ${unit}`;
              const color = row.delta === null || row.delta === 0 ? 'text-ash' : row.delta > 0 ? 'text-jade' : 'text-impact';
              return <article key={row.exerciseId} className="bevel-sm bg-ink-2 p-3">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="min-w-0 text-p2 font-bold text-bone">{row.name}</h2>
                  <span className={`fight-text shrink-0 text-p1 ${color}`}>{row.delta !== null && row.delta > 0 ? '↑' : row.delta !== null && row.delta < 0 ? '↓' : '—'}</span>
                </div>
                <p className="numeric mt-2 text-p2 text-ash">
                  {row.first === null ? '—' : formatValue(row.first, row.tracking)} → {row.last === null ? '—' : formatValue(row.last, row.tracking)} {unit}
                  <span className="ml-2">· {row.sessions} séance{row.sessions > 1 ? 's' : ''}</span>
                </p>
                <p className={`fight-text mt-1 text-p1 ${color}`}>{change}</p>
              </article>;
            })}</div>}
      </main>
    </div>
  );
}

function DateField({ id, label, value, min, max, onChange }: {
  id: string;
  label: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (value: string) => void;
}) {
  return <label className="min-w-0">
    <span className="fight-text block text-p1 tracking-[0.15em] text-ash">{label}</span>
    <input id={id} type="date" value={value} min={min} max={max} onChange={(event) => onChange(event.target.value)}
      className="bevel-in mt-1 w-full min-w-0 bg-ink-3 p-2 text-p2 text-bone [color-scheme:dark]" />
  </label>;
}

function formatValue(value: number, tracking: 'reps' | 'duration') {
  if (tracking !== 'duration') return value.toLocaleString('fr-FR');
  const seconds = Math.floor(value);
  return seconds >= 60 ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : String(seconds);
}
