/** Ecran de fin de seance : le K.O., puis le bilan chiffre. */
import { useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { sfx } from '../fx/audio';
import { navigate } from '../router';
import { doneEntries, recentLogs, tonnage } from '../store/selectors';
import { useStore } from '../store/state';
import type { AppState, SessionLog } from '../types';

/** Rang de la seance, compare a la fois precedente sur la meme seance du programme. */
function grade(state: AppState, log: SessionLog): { rank: string; delta: number | null } {
  const previous = recentLogs(state).find((l) => l.sessionId === log.sessionId && l.id !== log.id);
  const load = tonnage(doneEntries(log.entries));
  if (!previous) return { rank: 'A', delta: null };

  const before = tonnage(doneEntries(previous.entries));
  if (!before) return { rank: 'A', delta: null };

  const delta = (load - before) / before;
  if (delta >= 0.06) return { rank: 'S', delta };
  if (delta >= 0.01) return { rank: 'A', delta };
  if (delta >= -0.04) return { rank: 'B', delta };
  return { rank: 'C', delta };
}

/** Series ayant battu la meilleure charge connue sur l'exercice avant cette seance. */
function records(state: AppState, log: SessionLog): string[] {
  const found: string[] = [];
  for (const id of new Set(log.entries.map((e) => e.exerciseId))) {
    const best = Math.max(0, ...log.entries.filter((e) => e.exerciseId === id).map((e) => e.weight ?? 0));
    const previousBest = Math.max(
      0,
      ...state.logs
        .filter((l) => l.id !== log.id)
        .flatMap((l) => l.entries.filter((e) => e.exerciseId === id).map((e) => e.weight ?? 0)),
    );
    if (best > previousBest && best > 0) {
      found.push(`${log.entries.find((e) => e.exerciseId === id)?.exerciseName} · ${best} kg`);
    }
  }
  return found;
}

export function Results() {
  const { state, loaded } = useStore();
  const log = useMemo(() => recentLogs(state)[0] ?? null, [state]);

  useEffect(() => {
    if (loaded && !log) navigate('/', { replace: true });
  }, [loaded, log]);

  useEffect(() => {
    sfx.ko();
  }, []);

  if (!log) return null;

  const entries = doneEntries(log.entries);
  const load = tonnage(entries);
  const reps = entries.reduce((n, e) => n + (e.reps ?? 0), 0);
  const minutes =
    log.startedAt && log.endedAt
      ? Math.max(1, Math.round((Date.parse(log.endedAt) - Date.parse(log.startedAt)) / 60000))
      : null;
  const { rank, delta } = grade(state, log);
  const beaten = records(state, log);

  return (
    <div className="speedlines flex min-h-dvh flex-col bg-ink">
      <div className="pad-top pad-x flex flex-1 flex-col items-center justify-center gap-5 py-8">
        <motion.h1
          initial={{ scale: 2.2, opacity: 0, rotate: -12 }}
          animate={{ scale: 1, opacity: 1, rotate: -4 }}
          transition={{ type: 'spring', stiffness: 200, damping: 13 }}
          className="fight-text fight-shadow text-[5rem] leading-none text-blood"
        >
          k.o.
        </motion.h1>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="w-full"
        >
          <p className="fight-text text-center text-sm tracking-[0.3em] text-ash">
            {log.programCode}
          </p>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <Stat value={Math.round(load).toLocaleString('fr-FR')} unit="kg soulevés" />
            <Stat value={String(reps)} unit="répétitions" />
            <Stat value={minutes ? `${minutes}` : '—'} unit="minutes" />
          </div>

          <div className="bevel mt-3 flex items-center justify-between border border-impact/30 bg-impact/10 px-4 py-3">
            <span className="fight-text text-[0.7rem] tracking-[0.25em] text-ash">rang</span>
            <div className="flex items-baseline gap-2">
              {delta !== null && (
                <span className={`numeric text-sm ${delta >= 0 ? 'text-jade' : 'text-ash'}`}>
                  {delta >= 0 ? '+' : ''}
                  {Math.round(delta * 100)} % de volume
                </span>
              )}
              <span className="fight-text fight-shadow text-[3rem] leading-none text-impact">
                {rank}
              </span>
            </div>
          </div>

          {beaten.length > 0 && (
            <div className="bevel-sm mt-3 border border-blood/40 bg-blood/10 p-3">
              <p className="fight-text text-[0.7rem] tracking-[0.25em] text-blood-hot">
                nouveaux records
              </p>
              <ul className="mt-1.5 space-y-0.5">
                {beaten.map((r) => (
                  <li key={r} className="text-[0.8rem] text-bone">
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </motion.div>
      </div>

      <div className="pad-x pad-bottom grid gap-2">
        <button
          type="button"
          onClick={() => navigate('/history')}
          className="bevel-sm fight-text bg-ink-2 py-3.5 text-sm tracking-[0.15em] text-ash active:bg-ink-3"
        >
          voir l'historique
        </button>
        <button
          type="button"
          onClick={() => navigate('/', { replace: true })}
          className="bevel fight-text bg-blood py-4 text-xl text-bone active:bg-blood-hot"
        >
          continue
        </button>
      </div>
    </div>
  );
}

function Stat({ value, unit }: { value: string; unit: string }) {
  return (
    <div className="bevel-sm bg-ink-2 px-2 py-3 text-center">
      <p className="numeric fight-shadow text-2xl font-black text-bone">{value}</p>
      <p className="mt-0.5 text-[0.62rem] uppercase tracking-wider text-ash">{unit}</p>
    </div>
  );
}
