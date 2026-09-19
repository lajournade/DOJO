/**
 * Une barre de vie : un segment par serie prevue, qui tombe a chaque validation.
 *
 * Deux remplissages superposes. Celui du dessous, blanc, suit le meme rapport
 * mais avec du retard : il traine derriere le coup avant de se resorber. C'est le
 * detail qui fait lire « jeu de combat » plutot que « barre de progression ».
 */
import { useEffect, useState } from 'react';

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
 * Secondes ecoulees depuis un horodatage ISO, rafraichies chaque seconde. Le temps se
 * recalcule depuis l'horodatage a chaque tic, jamais depuis un compteur qu'un onglet
 * endormi cesserait d'incrementer : un rechargement ou un passage en arriere-plan
 * n'y change rien. Zero sans horodatage.
 */
export function useElapsed(startedAt: string | null): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!startedAt) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  if (!startedAt) return 0;
  return Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000));
}

/**
 * La boite centrale du bandeau : le chrono de la seance, minutes et secondes
 * ecoulees depuis le premier round.
 */
export function RoundClock({ seconds }: { seconds: number }) {
  const total = Math.max(0, Math.floor(seconds));
  // Deux chiffres de minutes tant que possible ; au-dela de 99, la boite s'elargit
  // plutot que de plafonner sur un nombre faux.
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');

  return (
    <div className="bevel-in flex h-14 min-w-14 shrink-0 flex-col items-center justify-center bg-line px-1 opacity-90">
      {/* Silkscreen plutot que Press Start 2P : un cadratin par glyphe ne tiendrait
          pas cinq caracteres dans la boite. */}
      <span className="label-text numeric text-p2 text-bone">
        {mm}:{ss}
      </span>
      <span className="label-text text-p1 text-ash">temps</span>
    </div>
  );
}
