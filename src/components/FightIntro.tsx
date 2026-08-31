/** Transition plein ecran entre la selection et la seance. */
import { useEffect } from 'react';
import { motion } from 'motion/react';
import { sfx } from '../fx/audio';

export function FightIntro({ label, onDone }: { label: string; onDone: () => void }) {
  useEffect(() => {
    sfx.fight();
    const id = setTimeout(onDone, 950);
    return () => clearTimeout(id);
  }, [onDone]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="speedlines fixed inset-0 z-50 flex flex-col items-center justify-center bg-ink"
    >
      <motion.span
        initial={{ scale: 0.2, opacity: 0, rotate: -8 }}
        animate={{ scale: 1, opacity: 1, rotate: -4 }}
        transition={{ type: 'spring', stiffness: 260, damping: 14 }}
        className="fight-text fight-shadow text-[4.5rem] leading-none text-blood"
      >
        fight
      </motion.span>
      <motion.span
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.28 }}
        className="fight-text mt-2 text-lg tracking-[0.3em] text-impact"
      >
        {label}
      </motion.span>
    </motion.div>
  );
}
