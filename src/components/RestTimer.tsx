/**
 * Chrono de repos circulaire, lance automatiquement apres chaque serie.
 * Il continue de tourner quand l'application passe en arriere-plan : le temps
 * restant se recalcule depuis l'horodatage de depart, pas depuis un compteur.
 */
import { useEffect, useState } from 'react';
import { sfx } from '../fx/audio';

interface Props {
  startedAt: number;
  duration: number;
  round: number;
  onDismiss: () => void;
  onExtend: (seconds: number) => void;
}

const RADIUS = 34;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function RestTimer({ startedAt, duration, round, onDismiss, onExtend }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const elapsed = (now - startedAt) / 1000;
  const left = Math.max(0, duration - elapsed);
  const done = left <= 0;

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  // Une seule sonnerie, au passage a zero.
  useEffect(() => {
    if (!done) return;
    sfx.bell();
  }, [done]);

  const mm = Math.floor(left / 60);
  const ss = Math.floor(left % 60);

  return (
    <div className="flex items-center gap-3">
      <div className="relative h-[78px] w-[78px] shrink-0">
        <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
          <circle cx="40" cy="40" r={RADIUS} fill="none" stroke="#1e1e26" strokeWidth="7" />
          <circle
            cx="40"
            cy="40"
            r={RADIUS}
            fill="none"
            stroke={done ? '#21c07a' : '#ffd400'}
            strokeWidth="7"
            strokeLinecap="butt"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - (duration ? left / duration : 0))}
            className="transition-[stroke-dashoffset] duration-300 ease-linear"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {done ? (
            <span className="fight-text text-[0.8rem] text-jade">go</span>
          ) : (
            <span className="numeric text-lg font-black text-bone">
              {mm}:{String(ss).padStart(2, '0')}
            </span>
          )}
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <p className="fight-text text-lg text-bone">
          {done ? `Round ${round}` : 'Repos'}
        </p>
        <p className="text-[0.75rem] text-ash">
          {done ? 'à toi de jouer' : 'reprends quand le compte tombe'}
        </p>
        <div className="mt-1.5 flex gap-1.5">
          <button
            type="button"
            onClick={() => onExtend(30)}
            className="bevel-sm bg-ink-3 px-3 py-1.5 text-[0.7rem] font-bold text-ash active:bg-ink-2"
          >
            +30 s
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="bevel-sm bg-ink-3 px-3 py-1.5 text-[0.7rem] font-bold text-ash active:bg-ink-2"
          >
            passer
          </button>
        </div>
      </div>
    </div>
  );
}
