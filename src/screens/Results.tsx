/** Ecran de fin de seance : le poing leve, puis le bilan qui se compte ligne a ligne. */
import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Sprite, useFrame } from '../components/Sprite';
import { sfx } from '../fx/audio';
import { HERO_FRAME, costume, fighter } from '../fx/sprites';
import { navigate } from '../router';
import { doneEntries, recentLogs, tonnage } from '../store/selectors';
import { useStore } from '../store/state';
import type { SessionLog, UserView } from '../types';

/** Rang de la seance, compare a la fois precedente sur la meme seance du programme. */
function grade(state: UserView, log: SessionLog): { rank: string; delta: number | null } {
  if (log.mode === 'free') return { rank: 'A', delta: null };
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
function records(state: UserView, log: SessionLog): string[] {
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

/**
 * Un chiffre qui defile jusqu'a sa valeur, comme le decompte des points en fin de
 * combat. Sous « animations reduites », il s'affiche directement.
 */
function useCountUp(target: number, delay: number, duration = 600): number {
  const [value, setValue] = useState(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) {
      setValue(target);
      return;
    }
    let raf = 0;
    let start = 0;
    const timer = setTimeout(() => {
      const tick = (t: number) => {
        if (!start) start = t;
        const p = Math.min(1, (t - start) / duration);
        setValue(Math.round(target * p));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, delay);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [target, delay, duration, reduced]);

  return value;
}

export function Results() {
  const { state, loaded } = useStore();
  const log = useMemo(() => recentLogs(state)[0] ?? null, [state]);
  const breath = useFrame(2, 2.5);

  useEffect(() => {
    if (loaded && !log) navigate('/', { replace: true });
  }, [loaded, log]);

  useEffect(() => {
    sfx.ko();
    const id = setTimeout(() => sfx.win(), 900);
    return () => clearTimeout(id);
  }, []);

  const entries = log ? doneEntries(log.entries) : [];
  const load = Math.round(tonnage(entries));
  const reps = entries.reduce((n, e) => n + (e.reps ?? 0), 0);
  const minutes =
    log?.startedAt && log.endedAt
      ? Math.max(1, Math.round((Date.parse(log.endedAt) - Date.parse(log.startedAt)) / 60000))
      : 0;

  // Les crochets doivent tourner a chaque rendu : les valeurs sont calculees avant la sortie.
  const shownLoad = useCountUp(load, 700);
  const shownReps = useCountUp(reps, 900);
  const shownMinutes = useCountUp(minutes, 1100);

  if (!log) return null;

  const { rank, delta } = grade(state, log);
  const beaten = records(state, log);

  return (
    <div className="flex min-h-dvh flex-col bg-ink">
      {/* Le combattant, le poing leve : la seance est battue. */}
      <div className="pad-top flex justify-center border-b-2 border-line pb-2">
        <Sprite
          sprite={fighter(state.user.palette).sprite}
          palette={costume(state.user.palette)}
          frame={HERO_FRAME.victory + breath}
          scale={3}
        />
      </div>

      <div className="speedlines pad-x flex flex-1 flex-col justify-center gap-4 py-5">
        <motion.h1
          initial={{ scale: 2.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 13 }}
          className="fight-text arcade-title text-center text-p5"
        >
          you win
        </motion.h1>

        <div className="bevel bg-ink-2 p-3">
          <Row label="tonnage" value={`${shownLoad.toLocaleString('fr-FR')} kg`} delay={0.7} />
          <Row label="répétitions" value={String(shownReps)} delay={0.9} />
          <Row label="durée" value={minutes ? `${shownMinutes} min` : '—'} delay={1.1} />

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.35 }}
            className="mt-2 flex items-center justify-between border-t-2 border-line pt-2"
          >
            <span className="fight-text text-p1 tracking-[0.2em] text-ash">rang</span>
            <div className="flex items-baseline gap-2">
              {delta !== null && (
                <span className={`numeric text-p2 ${delta >= 0 ? 'text-jade' : 'text-ash'}`}>
                  {delta >= 0 ? '+' : ''}
                  {Math.round(delta * 100)} % de volume
                </span>
              )}
              <span className="fight-text arcade-title text-p4">{rank}</span>
            </div>
          </motion.div>
        </div>

        {beaten.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.5 }}
            className="bevel-sm bg-blood/25 p-3"
          >
            <p className="fight-text pulsing text-p1 tracking-[0.2em] text-impact">
              nouveaux records
            </p>
            <ul className="mt-2 space-y-1">
              {beaten.map((r) => (
                <li key={r} className="text-p2 text-bone">
                  {r}
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </div>

      <div className="pad-x pad-bottom grid gap-2">
        <button
          type="button"
          onClick={() => navigate('/history')}
          className="bevel-sm keycap fight-text bg-ink-2 py-4 text-p2 text-ash"
        >
          voir l'historique
        </button>
        <button
          type="button"
          onClick={() => navigate('/', { replace: true })}
          className="notch block w-full bg-line p-[3px] transition-transform duration-75
                     active:translate-x-[3px] active:translate-y-[3px]"
        >
          <span className="notch flex h-14 w-full items-center justify-center bg-blood">
            <span className="fight-text fight-shadow text-p3 text-bone">continue</span>
          </span>
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, delay }: { label: string; value: string; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay }}
      className="flex items-baseline justify-between py-1"
    >
      <span className="label-text text-p2 text-ash">{label}</span>
      <span className="numeric fight-text text-p3 text-impact">{value}</span>
    </motion.div>
  );
}
