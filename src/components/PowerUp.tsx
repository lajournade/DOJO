/**
 * L'annonce de la montee en charge : la plaque s'ouvre, le gain claque, puis le
 * bandeau reste en place le temps de la serie. Une seule fois par exercice —
 * ensuite, l'information se reduit a un tag dans la rangee de l'arene.
 */
import { motion } from 'motion/react';
import type { Trend } from '../store/progression';

interface Props {
  trend: Trend;
  /** Le gain annonce : « +2,5 kg » ou « +1 rep ». */
  gain: string;
  reason: string;
}

export function PowerUp({ trend, gain, reason }: Props) {
  const strong = trend === 'up';

  return (
    <motion.div
      initial={{ scaleX: 0 }}
      animate={{ scaleX: 1 }}
      transition={{ duration: 0.22, ease: [0.2, 1.6, 0.35, 1] }}
      style={{ transformOrigin: 'left' }}
      className={`notch relative overflow-hidden p-2.5 ${strong ? 'bg-impact' : 'bg-ink-3'}`}
    >
      <span aria-hidden className="speedlines pointer-events-none absolute inset-0 opacity-40" />

      <div className="relative flex items-center justify-between gap-2">
        <span className={`fight-text text-p1 tracking-[0.2em] ${strong ? 'text-line' : 'text-impact'}`}>
          power up
        </span>
        {/* Le gain arrive en ressort, comme le « k.o. » de l'ecran de fin. Il
            grandit vers l'interieur de la plaque : depuis le bord droit, le
            depassement du ressort sortirait du cadre et serait rogne. */}
        <motion.span
          initial={{ scale: 2.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 13 }}
          style={{ transformOrigin: 'right' }}
          className={`numeric fight-text text-p3 ${strong ? 'text-blood' : 'text-bone'}`}
        >
          {gain}
        </motion.span>
      </div>

      <p className={`label-text relative mt-1 text-p2 ${strong ? 'text-line' : 'text-ash'}`}>
        {reason}
      </p>
    </motion.div>
  );
}
