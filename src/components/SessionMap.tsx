/**
 * La carte de la seance, ouverte depuis l'arene : tous les exercices dans l'ordre
 * prevu, ce qui est fini, ce qui est entame, ou l'on en est. Un appui sur un exercice
 * y mene — c'est le geste quand la machine est prise. Rien n'est reordonne : l'ordre
 * du plan reste celui du programme, `nextCursor` ramene sur ce qui reste.
 */
import { motion } from 'motion/react';
import { doneSets, stepStatus } from '../store/session';
import type { LiveSession } from '../types';

interface Props {
  live: LiveSession;
  onPick: (planIndex: number) => void;
  onClose: () => void;
}

export function SessionMap({ live, onPick, onClose }: Props) {
  const remaining = live.plan.filter((_, i) => stepStatus(live, i) !== 'done').length;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.12 }}
      className="fixed inset-0 z-50 flex h-dvh flex-col overflow-hidden bg-ink"
    >
      <header className="pad-top pad-x flex items-center justify-between gap-2 border-b-2 border-line pb-2">
        <button
          type="button"
          onClick={onClose}
          className="fight-text text-p1 tracking-[0.2em] text-ash"
        >
          ← retour
        </button>
        <span className="fight-text text-p1 text-impact">{live.programCode}</span>
      </header>

      <div className="pad-x flex items-baseline justify-between gap-2 py-2">
        <p className="label-text text-p2 text-bone">séance</p>
        <p className="numeric text-p2 text-ash">
          {remaining} {remaining > 1 ? 'restants' : 'restant'} / {live.plan.length}
        </p>
      </div>

      {/* Seule cette zone defile. */}
      <main className="pad-x min-h-0 flex-1 overflow-y-auto overflow-x-clip pb-3">
        <div className="grid gap-1.5">
          {live.plan.map((step, i) => {
            const status = stepStatus(live, i);
            const current = i === live.cursor.planIndex;
            const done = doneSets(live, i);
            return (
              <motion.button
                key={step.id}
                type="button"
                disabled={status === 'done'}
                onClick={() => onPick(i)}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: status === 'done' ? 0.6 : 1, x: 0 }}
                transition={{ delay: i * 0.04, duration: 0.25 }}
                className={`bevel-sm p-2.5 text-left ${
                  current ? 'bg-ink-3' : 'bg-ink-2'
                }`}
              >
                <div className="flex items-start gap-2">
                  {/* Le rang, ou la coche qui le remplace une fois l'exercice joue. */}
                  {status === 'done' ? (
                    <PixelCheck />
                  ) : (
                    <span className="fight-text numeric w-4 shrink-0 text-p2 text-impact">{i + 1}</span>
                  )}
                  <p className="min-w-0 flex-1 text-p2 font-bold uppercase leading-6 text-bone">
                    {step.exerciseName}
                  </p>
                  {step.supersetGroup && (
                    <span className="bevel-sm label-text shrink-0 bg-ink-3 px-1.5 text-p2 leading-6 text-impact">
                      superset {step.supersetGroup}
                    </span>
                  )}
                  {current ? (
                    <span className="bevel-sm label-text shrink-0 bg-impact px-1.5 text-p2 leading-6 text-line">
                      en cours
                    </span>
                  ) : (
                    status === 'started' && (
                      <span className="bevel-sm label-text shrink-0 bg-blood px-1.5 text-p2 leading-6 text-bone">
                        entamé
                      </span>
                    )
                  )}
                </div>
                <p className="numeric mt-0.5 pl-6 text-p2 text-ash">
                  {done}/{step.sets} séries
                </p>
              </motion.button>
            );
          })}
        </div>
      </main>
    </motion.div>
  );
}

/**
 * Une coche sur la grille : les polices bitmap n'ont pas le glyphe, et celui du
 * repli systeme sort fin et lisse au milieu des pixels. Dessinee en 8 × 8, rendue
 * a 2 px par case, sans lissage.
 */
function PixelCheck() {
  // Un trait de deux cases : a une case il ne pese rien a cote des lettres.
  const rows = ['........', '.......X', '......XX', '.X...XX.', '.XX.XX..', '..XXX...', '...X....', '........'];
  return (
    <svg
      aria-label="fini"
      viewBox="0 0 8 8"
      className="mt-1 h-4 w-4 shrink-0 text-jade"
      style={{ shapeRendering: 'crispEdges' }}
    >
      {rows.flatMap((row, y) =>
        [...row].map((c, x) =>
          c === 'X' ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="currentColor" /> : null,
        ),
      )}
    </svg>
  );
}
