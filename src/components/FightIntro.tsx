/**
 * Transition entre la selection et la seance : l'ecran VS, puis l'annonce du
 * round. Toujours passable au toucher — on est au milieu d'une seance, l'intro
 * ne doit jamais etre subie.
 */
import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { sfx } from '../fx/audio';
import { FOE, HERO, HERO_PALETTE, foePalette } from '../fx/sprites';
import { Sprite } from './Sprite';

interface Props {
  code: string;
  name: string;
  index: number;
  onDone: () => void;
}

export function FightIntro({ code, name, index, onDone }: Props) {
  const [phase, setPhase] = useState<0 | 1>(0);
  // La sortie ne part qu'une fois : le toucher et le minuteur visent la meme porte.
  const left = useRef(false);
  const done = () => {
    if (left.current) return;
    left.current = true;
    onDone();
  };

  useEffect(() => {
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
      {/* Bande diagonale : la separation des deux camps. */}
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          background:
            'linear-gradient(105deg, transparent 0 46%, var(--color-magenta) 46% 54%, transparent 54%)',
        }}
      />

      <div className="relative flex w-full items-end justify-between px-2">
        <motion.div initial={{ x: -140 }} animate={{ x: 0 }} transition={{ duration: 0.3 }}>
          <Sprite sprite={HERO} palette={HERO_PALETTE} scale={5} />
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
          <Sprite sprite={FOE} palette={foePalette(index)} scale={5} />
          <p className="fight-text fight-shadow mt-1 text-center text-p1 text-blood-hot">{code}</p>
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
