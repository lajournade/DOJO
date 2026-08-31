/**
 * Barre de vie de la seance : un segment par serie prevue, qui tombe a chaque
 * validation. C'est l'indicateur de progression, lu d'un coup d'oeil.
 */
interface Props {
  total: number;
  done: number;
  label: string;
  flash: number;
}

export function HealthBar({ total, done, label, flash }: Props) {
  const remaining = Math.max(0, total - done);
  const ratio = total ? remaining / total : 0;
  const critical = ratio <= 0.25 && remaining > 0;

  return (
    <div className="select-none">
      <div className="flex items-end justify-between px-0.5">
        <span className="fight-text text-[0.7rem] tracking-[0.2em] text-ash">{label}</span>
        <span className="numeric fight-text text-[0.7rem] text-ash">
          {done}/{total} séries
        </span>
      </div>

      <div className="relative mt-1 h-5 border-2 border-bone/25 bg-ink-3">
        {/* Jauge : elle se vide de la droite vers la gauche. */}
        <div
          className={`h-full origin-left transition-transform duration-500 ease-[var(--ease-out-hard)] ${
            critical ? 'bg-blood-hot pulsing' : 'bg-gradient-to-r from-impact to-blood'
          }`}
          style={{ transform: `scaleX(${ratio})` }}
        />
        {/* Separateurs de series, pour compter sans lire les chiffres. */}
        <div className="absolute inset-0 flex">
          {Array.from({ length: total }, (_, i) => (
            <div key={i} className="flex-1 border-r border-ink/70 last:border-r-0" />
          ))}
        </div>
        {/* Eclair blanc au moment de l'impact. */}
        <div
          key={flash}
          className="pointer-events-none absolute inset-0 bg-bone"
          style={{ animation: flash ? 'dojo-flash 320ms ease-out forwards' : 'none', opacity: 0 }}
        />
      </div>
    </div>
  );
}
