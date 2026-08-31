/**
 * Selecteur de RIR (repetitions en reserve), sur la derniere serie uniquement —
 * c'est la convention du suivi d'origine.
 */
const LEVELS = [0, 1, 2, 3, 4];

const CAPTION: Record<number, string> = {
  0: 'échec',
  1: 'limite',
  2: 'solide',
  3: 'facile',
  4: 'trop léger',
};

interface Props {
  value: number | null;
  target: string | null;
  onChange: (value: number) => void;
}

export function RirPicker({ value, target, onChange }: Props) {
  return (
    <div className="bevel-sm border border-blood/40 bg-blood/10 px-3 py-2.5">
      <div className="flex items-baseline justify-between">
        <span className="fight-text text-[0.7rem] tracking-[0.2em] text-blood-hot">
          RIR — dernière série
        </span>
        {target && <span className="numeric text-[0.7rem] text-ash">cible {target}</span>}
      </div>

      <div className="mt-2 flex gap-1.5">
        {LEVELS.map((level) => {
          const active = value === level;
          return (
            <button
              key={level}
              type="button"
              onClick={() => onChange(level)}
              className={`bevel-sm numeric h-14 flex-1 text-2xl font-black transition-transform
                          duration-75 active:scale-90 ${
                            active ? 'bg-blood text-bone' : 'bg-ink-3 text-ash'
                          }`}
            >
              {level}
            </button>
          );
        })}
      </div>

      <p className="mt-1.5 h-4 text-center text-[0.7rem] text-ash">
        {value !== null ? CAPTION[value] : 'combien de reps restaient en réserve ?'}
      </p>
    </div>
  );
}
