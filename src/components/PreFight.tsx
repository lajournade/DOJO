/**
 * L'annonce du combat : ce que la seance va couter, avant d'y entrer.
 *
 * L'Arena ne montre qu'un exercice a la fois — la seance se decouvrait donc serie
 * apres serie. Ici, tout est pose d'un coup : l'ordre des exercices, la charge que
 * le dojo proposera pour chacun, les montees du jour, la duree. On sait quoi
 * charger sur la barre avant de commencer.
 *
 * L'ecran ne fait que lire (`previewSession`) : ouvrir le briefing ne demarre
 * aucune seance, seul le bouton `fight` engage le combat.
 */
import { useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { sfx } from '../fx/audio';
import { HERO, HERO_BUST, costume } from '../fx/sprites';
import { previewSession, repRange, rirTarget, type StepPreview } from '../store/session';
import { useStore } from '../store/state';
import type { ProgramSession } from '../types';
import { Sprite, useFrame } from './Sprite';

interface Props {
  session: ProgramSession;
  onFight: () => void;
  onBack: () => void;
}

/** Les charges s'ecrivent a la francaise : « 72,5 kg », jamais « 72.5 ». */
const kg = (v: number) => `${v.toLocaleString('fr-FR')} kg`;

export function PreFight({ session, onFight, onBack }: Props) {
  const { state } = useStore();
  const preview = useMemo(() => previewSession(state, session), [state, session]);
  const breath = useFrame(2, 2.5);

  // Le briefing *est* le moment VS : c'est ici que le gong tombe, et `FightIntro`
  // enchaine ensuite directement sur « fight! ».
  useEffect(() => {
    sfx.vs();
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.12 }}
      className="fixed inset-0 z-50 flex h-dvh flex-col overflow-hidden bg-ink"
    >
      {/* ---- le face-a-face, fige : la bande diagonale de l'ecran VS ---- */}
      <header className="pad-top pad-x relative border-b-2 border-line pb-2">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-25"
          style={{
            background:
              'linear-gradient(105deg, transparent 0 46%, var(--color-magenta) 46% 54%, transparent 54%)',
          }}
        />

        <div className="relative flex items-center justify-between gap-2">
          <Sprite
            sprite={HERO}
            palette={costume(state.user.palette)}
            frame={breath}
            scale={3}
            cropX={HERO_BUST.x}
            cropY={HERO_BUST.y}
            cropW={HERO_BUST.w}
            cropH={HERO_BUST.h}
          />
          <span className="fight-text arcade-title text-p4">vs</span>
          <span className="fight-text arcade-title text-p5">{session.code}</span>
        </div>

        <div className="relative mt-1 flex items-baseline gap-2">
          <span className="fight-text bg-line px-1.5 py-0.5 text-p2 text-impact">
            {session.code}
          </span>
          <p className="min-w-0 flex-1 truncate text-p2 text-bone">{session.name}</p>
        </div>
      </header>

      {/* ---- le compte du combat ---- */}
      <div className="pad-x grid grid-cols-3 gap-1.5 py-2">
        <Plate value={preview.sets} label="séries" />
        <Plate value={preview.minutes} label={preview.estimated ? 'min env.' : 'min'} />
        {/* La troisieme plaque repond a « qu'est-ce qui bouge aujourd'hui ». Rien ne
            monte : elle dit ce qui se transpose, puis ce qui pietine, plutot que
            d'afficher un zero muet. */}
        {preview.ups > 0 ? (
          <Plate value={preview.ups} label={preview.ups > 1 ? 'montées' : 'montée'} tone="up" />
        ) : preview.shifts > 0 ? (
          <Plate
            value={preview.shifts}
            label={preview.shifts > 1 ? 'transposés' : 'transposé'}
            tone="up"
          />
        ) : preview.stuck > 0 ? (
          <Plate
            value={preview.stuck}
            label={preview.stuck > 1 ? 'bloqués' : 'bloqué'}
            tone="stuck"
          />
        ) : (
          <Plate value={0} label="montée" />
        )}
      </div>

      {/* ---- la carte du combat : seule cette zone defile ---- */}
      <main className="pad-x min-h-0 flex-1 overflow-y-auto overflow-x-clip pb-2">
        <div className="grid gap-1.5">
          {preview.steps.map((step, i) => (
            <Line key={step.step.id} preview={step} rank={i + 1} delay={i * 0.05} />
          ))}
        </div>
      </main>

      {/* ---- le geste principal, au ras du pouce ---- */}
      <div className="pad-x pad-bottom z-30 border-t-2 border-line bg-ink pt-2">
        <button
          type="button"
          onClick={onBack}
          className="fight-text mb-2 block text-p1 tracking-[0.2em] text-ash"
        >
          ← retour
        </button>
        <button
          type="button"
          onClick={onFight}
          className="notch block w-full bg-line p-[3px] transition-transform duration-75
                     active:translate-x-[3px] active:translate-y-[3px]"
        >
          <span className="notch relative flex h-[70px] w-full items-center justify-center overflow-hidden bg-blood">
            <span className="speedlines absolute inset-0 opacity-40" />
            <span className="fight-text fight-shadow relative text-p3 text-bone">fight</span>
          </span>
        </button>
      </div>
    </motion.div>
  );
}

/** Une plaque du bandeau : le chiffre en gros, son unite dessous. */
function Plate({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone?: 'up' | 'stuck';
}) {
  const skin =
    tone === 'up'
      ? { box: 'bg-impact', figure: 'text-line', label: 'text-line' }
      : tone === 'stuck'
        ? { box: 'bg-blood', figure: 'text-impact', label: 'text-bone' }
        : { box: 'bg-ink-2', figure: 'text-impact', label: 'text-ash' };

  return (
    <div className={`bevel-sm px-1 py-1.5 text-center ${skin.box}`}>
      <p className={`numeric fight-text text-p3 ${skin.figure}`}>{value}</p>
      <p className={`label-text text-p2 ${skin.label}`}>{label}</p>
    </div>
  );
}

/**
 * Un exercice de la carte. La charge annoncee est celle de la serie de travail ;
 * quand une rampe la precede, les deux extremites sont donnees — c'est ce qu'on
 * pose sur la barre en arrivant, et ce qu'on aura a la fin.
 */
function Line({
  preview,
  rank,
  delay,
}: {
  preview: StepPreview;
  rank: number;
  delay: number;
}) {
  const { step } = preview;
  const target = rirTarget(step);

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.25 }}
      className="bevel-sm bg-ink-2 p-2.5"
    >
      {/* Le nom d'abord : c'est lui qu'on cherche du regard, et la montee du jour
          se lit dans la foulee — elle qualifie l'exercice, pas son chiffrage. */}
      <div className="flex items-start gap-2">
        <span className="fight-text numeric w-4 shrink-0 text-p2 text-impact">{rank}</span>
        <p className="min-w-0 flex-1 text-p2 font-bold uppercase leading-6 text-bone">
          {step.exerciseName}
        </p>
        {/* Deux lignes voisines qui portent la meme lettre s'enchainent sans repos. */}
        {step.supersetGroup && (
          <span className="bevel-sm label-text shrink-0 bg-ink-3 px-1.5 text-p2 leading-6 text-impact">
            superset {step.supersetGroup}
          </span>
        )}
        {preview.gain && (
          <span className="bevel-sm label-text shrink-0 bg-impact px-1.5 text-p2 leading-6 text-line">
            {preview.gain}
          </span>
        )}
        {/* Le gain est vide sur un palier : les deux plaques ne se disputent jamais la place. */}
        {preview.plateau && (
          <span className="bevel-sm label-text pulsing shrink-0 bg-blood px-1.5 text-p2 leading-6 text-bone">
            bloqué
          </span>
        )}
      </div>

      {/* Puis le chiffrage : la charge tombe toujours au meme fer a droite. */}
      <div className="mt-0.5 flex items-baseline justify-between gap-2 pl-6">
        <p className="numeric truncate text-p2 text-ash">
          {step.sets} × {repRange(step)}
          {target ? ` · rir ${target}` : ''}
        </p>
        {preview.known ? (
          <p className="numeric shrink-0 text-p2 text-bone">
            {preview.ramp
              ? `${preview.first.toLocaleString('fr-FR')} à ${kg(preview.work)}`
              : kg(preview.work)}
          </p>
        ) : (
          <p className="shrink-0 text-p2 text-ash">première fois</p>
        )}
      </div>

      {/* La raison du blocage, sous le chiffrage : c'est lui qu'elle qualifie. */}
      {preview.plateau && (
        <p className="label-text mt-0.5 pl-6 text-p2 text-blood">
          {preview.plateau.sessions} séances sans montée
        </p>
      )}
    </motion.div>
  );
}
