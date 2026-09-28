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
  free?: boolean;
  value: number | null;
  target: string | null;
  onChange: (value: number) => void;
}

export function RirPicker({ value, target, onChange, free = false }: Props) {
  return (
    <div className="bevel-sm bg-blood/20 px-2 py-2">
      <div className="flex items-baseline justify-between">
        <span className="label-text text-p2 text-impact">
          {free ? 'rir — facultatif' : 'rir — dernière série'}
        </span>
        {target && <span className="numeric text-p1 text-ash">cible {target}</span>}
      </div>

      <div className="mt-2 flex gap-1.5">
        {LEVELS.map((level) => {
          const active = value === level;
          return (
            <button
              key={level}
              type="button"
              onClick={() => onChange(level)}
              className={`bevel-sm keycap numeric fight-text h-14 flex-1 text-p3 ${
                active ? 'bg-blood text-bone' : 'bg-ink-3 text-ash'
              }`}
            >
              {level}
            </button>
          );
        })}
      </div>

      <p className="mt-2 h-6 text-center text-p2 text-ash">
        {value !== null ? CAPTION[value] : 'combien de reps restaient en réserve ?'}
      </p>
    </div>
  );
}
