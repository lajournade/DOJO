/**
 * Une barre de vie : un segment par serie prevue, qui tombe a chaque validation.
 *
 * Deux remplissages superposes. Celui du dessous, blanc, suit le meme rapport
 * mais avec du retard : il traine derriere le coup avant de se resorber. C'est le
 * detail qui fait lire « jeu de combat » plutot que « barre de progression ».
 */
interface Props {
  name: string;
  total: number;
  done: number;
  /** Cote d'ancrage : la barre se vide vers l'exterieur de l'ecran. */
  side: 'left' | 'right';
  flash: number;
}

export function HealthBar({ name, total, done, side, flash }: Props) {
  const remaining = Math.max(0, total - done);
  const ratio = total ? remaining / total : 0;
  const critical = ratio <= 0.25 && remaining > 0;

  const origin = side === 'left' ? 'origin-left' : 'origin-right';
  const fill = ratio > 0.5 ? 'bg-impact' : ratio > 0.25 ? 'bg-orange' : 'bg-blood';

  return (
    <div className="min-w-0 flex-1 select-none">
      <div className="bevel-in relative h-5 overflow-hidden bg-ink-3">
        {/* Le retard : meme rapport, mais il part 260 ms plus tard. */}
        <div
          className={`absolute inset-0 bg-bone ${origin}`}
          style={{
            transform: `scaleX(${ratio})`,
            transition: 'transform 400ms linear 260ms',
          }}
        />
        <div
          className={`absolute inset-0 ${fill} ${origin} ${critical ? 'pulsing' : ''}`}
          style={{ transform: `scaleX(${ratio})`, transition: 'transform 120ms linear' }}
        />

        {/* Separateurs de series : compter sans lire les chiffres. */}
        <div className="absolute inset-0 flex">
          {Array.from({ length: total }, (_, i) => (
            <div key={i} className="flex-1 border-r-2 border-line/60 last:border-r-0" />
          ))}
        </div>

        {/* Eclair blanc au moment de l'impact. */}
        <div
          key={flash}
          className="pointer-events-none absolute inset-0 bg-bone"
          style={{ animation: flash ? 'dojo-flash 320ms steps(4) forwards' : 'none', opacity: 0 }}
        />
      </div>

      <div className={`mt-0.5 flex items-baseline gap-2 ${side === 'right' ? 'flex-row-reverse' : ''}`}>
        <span className="fight-text truncate text-p1 text-bone">{name}</span>
        <span className="numeric text-p1 text-ash">
          {done}/{total}
        </span>
      </div>
    </div>
  );
}

/**
 * La boite centrale du bandeau : le compte des series restantes — la boite ne
 * reste jamais vide.
 */
export function RoundClock({ seconds }: { seconds: number }) {
  const count = String(Math.max(0, Math.ceil(seconds))).padStart(2, '0');

  return (
    <div className="bevel-in flex h-14 w-14 shrink-0 flex-col items-center justify-center bg-line opacity-90">
      {/* Deux chiffres tant que possible ; au-dela, la boite se resserre plutot
          que de plafonner sur un nombre faux. */}
      <span className={`fight-text numeric text-bone ${count.length > 2 ? 'text-p2' : 'text-p3'}`}>
        {count}
      </span>
      <span className="label-text text-p1 text-ash">sér.</span>
    </div>
  );
}
