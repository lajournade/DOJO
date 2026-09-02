/**
 * Le repos entre deux series. Le decompte continue quand l'application passe en
 * arriere-plan : le temps restant se recalcule depuis l'horodatage de depart,
 * jamais depuis un compteur qu'un onglet endormi cesserait d'incrementer.
 *
 * L'affichage du chrono lui-meme vit dans le bandeau (<RoundClock>) ; ici il ne
 * reste que l'annonce et les deux commandes.
 */
import { useEffect, useState } from 'react';
import { sfx } from '../fx/audio';

export interface Rest {
  startedAt: number;
  duration: number;
}

/** Temps restant sur le repos en cours, et la sonnerie unique au passage a zero. */
export function useRestCountdown(rest: Rest | null) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!rest) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [rest]);

  const left = rest ? Math.max(0, rest.duration - (now - rest.startedAt) / 1000) : 0;
  const done = rest !== null && left <= 0;

  useEffect(() => {
    if (done) sfx.bell();
  }, [done]);

  return { left, done };
}

interface Props {
  left: number;
  done: boolean;
  round: number;
  onDismiss: () => void;
  onExtend: (seconds: number) => void;
}

export function RestTimer({ left, done, round, onDismiss, onExtend }: Props) {
  const mm = Math.floor(left / 60);
  const ss = Math.floor(left % 60);

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <p className={`fight-text text-p2 ${done ? 'text-jade' : 'text-impact'}`}>
          {done ? `round ${round}` : 'repos'}
        </p>
        <p className="numeric text-p2 text-ash">
          {done ? 'à toi de jouer' : `${mm}:${String(ss).padStart(2, '0')} restantes`}
        </p>
      </div>

      <div className="flex shrink-0 gap-1.5">
        <button
          type="button"
          onClick={() => onExtend(30)}
          className="bevel-sm keycap fight-text bg-ink-3 px-2.5 py-2 text-p1 text-bone"
        >
          +30 s
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="bevel-sm keycap fight-text bg-ink-3 px-2.5 py-2 text-p1 text-bone"
        >
          passer
        </button>
      </div>
    </div>
  );
}
