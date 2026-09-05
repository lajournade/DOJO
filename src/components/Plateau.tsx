/**
 * L'annonce du palier : le pendant sombre de <PowerUp>. Meme mecanique — la plaque
 * s'ouvre depuis la gauche, le compte claque en ressort — mais elle constate un
 * pietinement au lieu d'un gain, et propose la sortie sans l'appliquer : decharger
 * reste un appui volontaire.
 *
 * Une seule fois par exercice ; ensuite l'information se reduit a un tag de l'arene.
 */
import { motion } from 'motion/react';

interface Props {
  /** Nombre de seances passees a cette meme charge. */
  sessions: number;
  /** La charge proposee apres dechargement. */
  weight: number;
  onDeload: () => void;
}

/** Les charges s'ecrivent a la francaise : « 27,5 kg », jamais « 27.5 ». */
const kg = (v: number) => `${v.toLocaleString('fr-FR')} kg`;

export function Plateau({ sessions, weight, onDeload }: Props) {
  return (
    <motion.div
      initial={{ scaleX: 0 }}
      animate={{ scaleX: 1 }}
      transition={{ duration: 0.22, ease: [0.2, 1.6, 0.35, 1] }}
      style={{ transformOrigin: 'left' }}
      className="notch relative overflow-hidden bg-blood p-2.5"
    >
      <span aria-hidden className="speedlines pointer-events-none absolute inset-0 opacity-40" />

      <div className="relative flex items-center justify-between gap-2">
        {/* Press Start 2P dessine ses capitales accentuees a hauteur de bas de casse :
            le titre reste dans le vocabulaire arcade, sans accent. */}
        <span className="fight-text text-p1 tracking-[0.2em] text-bone">stalled</span>
        <motion.span
          initial={{ scale: 2.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 13 }}
          style={{ transformOrigin: 'right' }}
          className="numeric fight-text text-p3 text-impact"
        >
          {sessions}
        </motion.span>
      </div>

      <p className="label-text relative mt-1 text-p2 text-bone">
        même charge depuis {sessions} séances
      </p>

      <button
        type="button"
        onClick={onDeload}
        className="bevel-sm keycap label-text relative mt-2 block w-full bg-ink py-2.5 text-p2 text-impact"
      >
        décharger à {kg(weight)}
      </button>
    </motion.div>
  );
}
