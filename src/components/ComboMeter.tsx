/** Compteur de series enchainees dans la seance. */
import { motion } from 'motion/react';

export function comboLabel(count: number): string | null {
  if (count >= 8) return 'perfect';
  if (count >= 5) return 'great';
  if (count >= 2) return 'good';
  return null;
}

export function ComboMeter({ count }: { count: number }) {
  if (count < 2) return null;
  const label = comboLabel(count);

  return (
    <motion.div
      key={count}
      initial={{ scale: 1.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 520, damping: 18 }}
      className="flex items-baseline gap-1.5"
    >
      <span className="numeric fight-text fight-shadow text-2xl text-impact">×{count}</span>
      <span className="fight-text text-[0.7rem] tracking-[0.2em] text-blood-hot">{label}</span>
    </motion.div>
  );
}
