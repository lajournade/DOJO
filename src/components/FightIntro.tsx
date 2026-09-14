/**
 * Transition entre la selection et la seance : l'ecran VS, puis l'annonce du
 * round. Toujours passable au toucher — on est au milieu d'une seance, l'intro
 * ne doit jamais etre subie.
 *
 * Quand le briefing d'avant-combat a deja pose le face-a-face, `withVs` tombe a
 * faux : le rejouer ferait doublon, seul « fight! » reste.
 */
import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { sfx } from '../fx/audio';
import { HERO, costume } from '../fx/sprites';
import { useStore } from '../store/state';
import { Sprite } from './Sprite';

interface Props {
  code: string;
  name: string;
  /** Faux quand le moment VS a deja eu lieu ailleurs : on entre direct sur « fight! ». */
  withVs?: boolean;
  onDone: () => void;
}

export function FightIntro({ code, name, withVs = true, onDone }: Props) {
  const { state } = useStore();
  const [phase, setPhase] = useState<0 | 1>(withVs ? 0 : 1);
  // La sortie ne part qu'une fois : le toucher et le minuteur visent la meme porte.
  const left = useRef(false);
  const done = () => {
    if (left.current) return;
    left.current = true;
    onDone();
  };

  useEffect(() => {
    if (!withVs) {
      sfx.fight();
      const straight = setTimeout(done, 1000);
      return () => clearTimeout(straight);
    }

    sfx.vs();
    const toRound = setTimeout(() => {
      setPhase(1);
      sfx.fight();
    }, 750);
    const toEnd = setTimeout(done, 1750);
    return () => {
      clearTimeout(toRound);
      clearTimeout(toEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.12 }}
      onClick={done}
      className="speedlines fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-ink"
    >
      <div className="relative flex w-full items-end justify-center gap-6 px-2">
        <motion.div initial={{ x: -140 }} animate={{ x: 0 }} transition={{ duration: 0.3 }}>
          <Sprite sprite={HERO} palette={costume(state.user.palette)} scale={3} />
          <p className="fight-text fight-shadow mt-1 text-center text-p1 text-cyan">vous</p>
        </motion.div>

        <motion.span
          initial={{ scale: 2.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 14 }}
          className="fight-text arcade-title mb-10 text-p5"
        >
          vs
        </motion.span>

        <motion.div initial={{ x: 140 }} animate={{ x: 0 }} transition={{ duration: 0.3 }}>
          <p className="fight-text arcade-title text-p5">{code}</p>
          <p className="label-text mt-1 text-center text-p2 text-blood-hot">séance</p>
        </motion.div>
      </div>

      <p className="relative max-w-full truncate px-3 text-p2 text-ash">{name}</p>

      {phase === 1 && (
        <div className="relative flex flex-col items-center">
          <motion.span
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="fight-text fight-shadow text-p2 text-bone"
          >
            round 1
          </motion.span>
          <motion.span
            initial={{ scale: 0.2, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 12 }}
            className="fight-text arcade-title mt-2 text-p5"
          >
            fight!
          </motion.span>
        </div>
      )}
    </motion.div>
  );
}
