/**
 * Compteur au pouce : deux boutons de 72 px, appui long pour l'acceleration,
 * appui sur la valeur pour la saisie directe au clavier numerique.
 */
import { useEffect, useRef, useState } from 'react';

interface Props {
  label: string;
  unit: string;
  value: number;
  step: number;
  min?: number;
  max?: number;
  decimals?: number;
  hint?: string;
  tone?: 'blood' | 'impact';
  onChange: (value: number) => void;
}

const fmt = (v: number, decimals: number) =>
  v.toFixed(decimals).replace(/\.?0+$/, '').replace('.', ',') || '0';

export function BigStepper({
  label,
  unit,
  value,
  step,
  min = -999,
  max = 9999,
  decimals = 1,
  hint,
  tone = 'blood',
  onChange,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const timers = useRef<{ start?: number; repeat?: number }>({});
  // La valeur courante dans une ref : l'intervalle d'appui long doit voir le dernier etat.
  const latest = useRef(value);
  latest.current = value;

  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));

  const bump = (direction: number) => {
    onChange(clamp(latest.current + direction * step));
  };

  const stopRepeat = () => {
    clearTimeout(timers.current.start);
    clearInterval(timers.current.repeat);
    timers.current = {};
  };

  useEffect(() => stopRepeat, []);

  const hold = (direction: number) => {
    bump(direction);
    timers.current.start = setTimeout(() => {
      let ticks = 0;
      timers.current.repeat = setInterval(() => {
        ticks += 1;
        // Apres une seconde d'appui, on avance par pas de 4 : atteindre 100 kg reste rapide.
        bump(direction * (ticks > 10 ? 4 : 1));
      }, 110) as unknown as number;
    }, 420) as unknown as number;
  };

  const commit = () => {
    const parsed = Number(draft.replace(',', '.'));
    if (Number.isFinite(parsed)) onChange(clamp(parsed));
    setEditing(false);
  };

  const accent = tone === 'impact' ? 'text-impact' : 'text-bone';

  return (
    <div className="bevel-sm bg-ink-2 border border-white/5 px-3 py-2.5">
      <div className="flex items-baseline justify-between">
        <span className="fight-text text-[0.7rem] tracking-widest text-ash">{label}</span>
        {hint && <span className="numeric text-[0.7rem] text-ash/80">{hint}</span>}
      </div>

      <div className="mt-1 flex items-center justify-between gap-2">
        <StepButton sign="−" onHold={() => hold(-1)} onRelease={stopRepeat} />

        {editing ? (
          <input
            autoFocus
            type="text"
            inputMode="decimal"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && commit()}
            className="numeric w-full min-w-0 bg-transparent text-center text-4xl font-black text-impact outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraft(fmt(value, decimals));
              setEditing(true);
            }}
            className="flex min-w-0 flex-1 flex-col items-center leading-none"
          >
            <span className={`numeric fight-shadow text-[2.75rem] font-black ${accent}`}>
              {fmt(value, decimals)}
            </span>
            <span className="fight-text mt-0.5 text-[0.65rem] tracking-[0.2em] text-ash">{unit}</span>
          </button>
        )}

        <StepButton sign="+" onHold={() => hold(1)} onRelease={stopRepeat} />
      </div>
    </div>
  );
}

function StepButton({
  sign,
  onHold,
  onRelease,
}: {
  sign: string;
  onHold: () => void;
  onRelease: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={sign === '+' ? 'augmenter' : 'diminuer'}
      onPointerDown={(e) => {
        e.preventDefault();
        onHold();
      }}
      onPointerUp={onRelease}
      onPointerLeave={onRelease}
      onPointerCancel={onRelease}
      onContextMenu={(e) => e.preventDefault()}
      className="bevel-sm h-[72px] w-[72px] shrink-0 bg-ink-3 text-3xl font-black text-bone
                 transition-transform duration-75 active:scale-90 active:bg-blood"
    >
      {sign}
    </button>
  );
}
