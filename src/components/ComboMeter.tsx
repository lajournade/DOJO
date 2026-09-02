/** Compteur de series enchainees, au format des jeux de combat : le nombre, puis « hits ». */
import { motion } from 'motion/react';

export function comboLabel(count: number): string | null {
  if (count >= 8) return 'perfect';
  if (count >= 5) return 'great';
  if (count >= 2) return 'good';
  return null;
}

export function ComboMeter({ count }: { count: number }) {
  if (count < 2) return null;

  return (
    <motion.div
      key={count}
      initial={{ scale: 1.6, opacity: 0, x: -10 }}
      animate={{ scale: 1, opacity: 1, x: 0 }}
      transition={{ type: 'spring', stiffness: 520, damping: 18 }}
      className="flex flex-col items-start leading-none"
    >
      <span className="numeric fight-text arcade-title text-p4">{count}</span>
      <span className="fight-text fight-shadow mt-1 text-p1 text-bone">
        {comboLabel(count)} hits
      </span>
    </motion.div>
  );
}
