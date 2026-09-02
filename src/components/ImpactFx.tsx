/**
 * Retour visuel d'un coup : le tonnage de la serie qui s'envole, le libelle de
 * combo, et un eclair rouge plein ecran sur les gros impacts.
 */
import { AnimatePresence, motion } from 'motion/react';

export interface Hit {
  id: number;
  damage: number;
  power: number;
  label: string | null;
}

export function ImpactFx({ hits }: { hits: Hit[] }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      <AnimatePresence>
        {hits.map((hit) => (
          <motion.div
            key={hit.id}
            initial={{ opacity: 0, scale: 0.4, y: 0 }}
            animate={{ opacity: 1, scale: 1, y: -110 }}
            exit={{ opacity: 0, scale: 0.8, y: -150 }}
            transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-x-0 top-[24%] flex flex-col items-center"
          >
            {/* La taille suit la puissance, mais reste sur des paliers entiers. */}
            <span
              className="fight-text arcade-title numeric"
              style={{ fontSize: hit.power > 0.75 ? 48 : hit.power > 0.4 ? 32 : 24 }}
            >
              {Math.round(hit.damage)}
            </span>
            {hit.label && (
              <span className="fight-text fight-shadow mt-1 text-p2 text-blood-hot">
                {hit.label}
              </span>
            )}
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Eclair plein ecran : reserve aux coups les plus lourds. */}
      <AnimatePresence>
        {hits.some((h) => h.power > 0.75) && (
          <motion.div
            initial={{ opacity: 0.32 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 bg-bone"
          />
        )}
      </AnimatePresence>
    </div>
  );
}
