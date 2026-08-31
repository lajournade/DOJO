/**
 * L'ecran de seance : une serie, deux compteurs, un bouton.
 * Tout le reste (chrono, combo, barre de vie) est du retour d'information.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { BigStepper } from '../components/BigStepper';
import { ComboMeter, comboLabel } from '../components/ComboMeter';
import { HealthBar } from '../components/HealthBar';
import { ImpactFx, type Hit } from '../components/ImpactFx';
import { RestTimer } from '../components/RestTimer';
import { RirPicker } from '../components/RirPicker';
import { sfx } from '../fx/audio';
import { useShake } from '../fx/shake';
import { keepAwake, rearmOnVisible, releaseAwake } from '../fx/wakelock';
import { navigate } from '../router';
import { bestWeight } from '../store/selectors';
import {
  abortSession,
  addSet,
  finishSession,
  isFinished,
  logSet,
  moveTo,
  repRange,
  rirTarget,
  suggestion,
  totalSets,
  undoLastSet,
} from '../store/session';
import { useStore } from '../store/state';

export function Arena() {
  const { state, loaded, status, pending } = useStore();
  const live = state.liveSession;

  const [weight, setWeight] = useState(0);
  const [reps, setReps] = useState(0);
  const [rir, setRir] = useState<number | null>(null);
  const [rest, setRest] = useState<{ startedAt: number; duration: number } | null>(null);
  const [hits, setHits] = useState<Hit[]>([]);
  const [combo, setCombo] = useState(0);
  const [flash, setFlash] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const { shake, props: shakeProps } = useShake();

  const step = live?.plan[live.cursor.planIndex] ?? null;
  const cursorKey = live ? `${live.cursor.planIndex}:${live.cursor.setIndex}` : '';
  const isLastSet = step ? live!.cursor.setIndex >= step.sets : false;

  // Ecran allume tant que la seance dure.
  useEffect(() => {
    void keepAwake();
    const stop = rearmOnVisible();
    return () => {
      stop();
      releaseAwake();
    };
  }, []);

  // Cloture de la seance : le journal prend le relais, direction les resultats.
  const ended = useRef(false);
  const end = () => {
    ended.current = true;
    finishSession();
    navigate('/results', { replace: true });
  };

  // Pas de seance en cours : rien a faire ici — sauf juste apres une cloture.
  useEffect(() => {
    if (loaded && !live && !ended.current) navigate('/', { replace: true });
  }, [live, loaded]);

  // Derniere serie du dernier exercice validee : le combat est fini.
  useEffect(() => {
    if (live && isFinished(live) && !ended.current) end();
  });

  // Chaque nouvelle serie repart de ce qui a ete fait la derniere fois.
  useEffect(() => {
    if (!live || !step) return;
    const s = suggestion(state, live);
    setWeight(s.weight);
    setReps(s.reps);
    setRir(null);
    setShowNotes(false);
    // Volontairement limite au curseur : on ne veut pas ecraser une saisie en cours.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorKey]);

  const record = useMemo(
    () => (step ? bestWeight(state, step.exerciseId) : 0),
    [state, step],
  );

  const hitId = useRef(0);

  if (!live || !step) return null;

  const done = live.entries.length;
  const total = totalSets(live.plan);
  const target = rirTarget(step);

  const validate = () => {
    // Le tonnage sert de degats. Au poids du corps (charge nulle), on compte les repetitions.
    const damage = (weight || 10) * reps;
    const power = record > 0 ? Math.min(1, weight / record) : 0.6;
    const isRecord = weight > record && weight > 0;
    const nextCombo = combo + 1;

    setCombo(nextCombo);
    setFlash((f) => f + 1);
    shake(isRecord ? 1 : power);
    sfx.hit(isRecord ? 1 : power);
    if (comboLabel(nextCombo) && nextCombo % 3 === 0) sfx.combo(Math.floor(nextCombo / 3));

    hitId.current += 1;
    const hit: Hit = {
      id: hitId.current,
      damage,
      power: isRecord ? 1 : power,
      label: isRecord ? 'record !' : comboLabel(nextCombo),
    };
    setHits((h) => [...h, hit]);
    setTimeout(() => setHits((h) => h.filter((x) => x.id !== hit.id)), 900);

    logSet(live, { reps, weight, rir: isLastSet ? rir : null });

    const lastOfSession = live.cursor.planIndex >= live.plan.length - 1 && isLastSet;
    setRest(lastOfSession ? null : { startedAt: Date.now(), duration: step.restSec });
  };

  return (
    <div {...shakeProps} className={`${shakeProps.className ?? ''} flex h-dvh flex-col overflow-hidden bg-ink`}>
      <ImpactFx hits={hits} />

      <header className="pad-top pad-x flex items-center justify-between gap-2 pb-2">
        <button
          type="button"
          onClick={() => {
            if (confirm('Abandonner la séance en cours ?')) {
              abortSession();
              navigate('/', { replace: true });
            }
          }}
          className="fight-text text-[0.7rem] tracking-[0.2em] text-ash"
        >
          ← quitter
        </button>
        <span className="flex items-center gap-1.5">
          <span className="fight-text text-sm text-blood-hot">{live.programCode}</span>
          {/* Le reseau peut tomber en pleine seance : on le signale sans jamais interrompre. */}
          {status === 'offline' && (
            <span className="bevel-sm numeric bg-blood/20 px-1.5 py-0.5 text-[0.62rem] font-bold text-blood-hot">
              ⇅ {pending}
            </span>
          )}
        </span>
        <ComboMeter count={combo} />
      </header>

      <div className="pad-x">
        <HealthBar total={total} done={done} label="séance" flash={flash} />
      </div>

      {/* Seule cette zone defile : la barre d'action reste sous le pouce. */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-clip pb-3">
      {/* Exercice courant */}
      <motion.section
        key={live.cursor.planIndex}
        initial={{ opacity: 0, x: 28 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="pad-x mt-4"
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="fight-text text-[0.7rem] tracking-[0.25em] text-ash">
            exercice {live.cursor.planIndex + 1}/{live.plan.length}
          </span>
          {record > 0 && (
            <span className="numeric text-[0.7rem] text-ash">record {record} kg</span>
          )}
        </div>

        <h1 className="fight-text fight-shadow mt-1 text-[2rem] leading-[0.95] text-bone">
          {step.exerciseName}
        </h1>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Tag tone="blood">
            série {live.cursor.setIndex}/{step.sets}
          </Tag>
          <Tag>{repRange(step)} reps</Tag>
          {target && <Tag>rir {target}</Tag>}
          {step.notes && (
            <button
              type="button"
              onClick={() => setShowNotes((v) => !v)}
              className="bevel-sm bg-ink-3 px-2 py-1 text-[0.7rem] font-bold text-ash"
            >
              {showNotes ? 'masquer' : 'conseil'}
            </button>
          )}
        </div>

        {showNotes && step.notes && (
          <p className="mt-2 border-l-2 border-blood/60 bg-ink-2 p-2.5 text-[0.8rem] leading-snug text-ash">
            {step.notes}
          </p>
        )}
      </motion.section>

      {rest && (
        <section className="pad-x mt-3">
          <div className="bevel-sm border border-impact/25 bg-ink-2 p-2.5">
            <RestTimer
              startedAt={rest.startedAt}
              duration={rest.duration}
              round={live.cursor.setIndex}
              onDismiss={() => setRest(null)}
              onExtend={(s) => setRest((r) => (r ? { ...r, duration: r.duration + s } : r))}
            />
          </div>
        </section>
      )}

      <section className="pad-x mt-3 grid gap-2">
        <BigStepper
          label="charge"
          unit="kg"
          value={weight}
          step={2.5}
          min={-100}
          onChange={setWeight}
        />
        <BigStepper
          label="répétitions"
          unit="reps"
          value={reps}
          step={1}
          min={0}
          max={100}
          decimals={0}
          tone="impact"
          hint={`cible ${repRange(step)}`}
          onChange={setReps}
        />
        {isLastSet && <RirPicker value={rir} target={target} onChange={setRir} />}
      </section>

      {/* Actions secondaires */}
      <section className="pad-x mt-3 flex flex-wrap gap-1.5">
        <Small onClick={() => addSet(live)}>+ série</Small>
        <Small onClick={() => moveTo(live.cursor.planIndex + 1)}>passer l'exercice</Small>
        {live.entries.length > 0 && (
          <Small
            onClick={() => {
              undoLastSet(live);
              setCombo(0);
              setRest(null);
            }}
          >
            annuler la dernière
          </Small>
        )}
        <Small onClick={end}>terminer</Small>
      </section>

      </div>

      {/* Le geste principal, a portee de pouce, au ras du bas d'ecran. */}
      <div className="pad-x pad-bottom z-30 border-t border-white/5 bg-ink pt-3">
        <button
          type="button"
          onClick={validate}
          className="bevel relative h-[76px] w-full overflow-hidden bg-blood text-bone
                     transition-transform duration-75 active:scale-[0.97] active:bg-blood-hot"
        >
          <span className="speedlines absolute inset-0 opacity-40" />
          <span className="fight-text fight-shadow relative text-3xl tracking-wide">
            {isLastSet && live.cursor.planIndex === live.plan.length - 1 ? 'finish him' : 'impact'}
          </span>
        </button>
      </div>
    </div>
  );
}

function Tag({ children, tone }: { children: React.ReactNode; tone?: 'blood' }) {
  return (
    <span
      className={`bevel-sm px-2 py-1 text-[0.7rem] font-black uppercase tracking-wider ${
        tone === 'blood' ? 'bg-blood text-bone' : 'bg-ink-3 text-ash'
      }`}
    >
      {children}
    </span>
  );
}

function Small({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bevel-sm bg-ink-2 px-2.5 py-2 text-[0.72rem] font-bold text-ash active:bg-ink-3"
    >
      {children}
    </button>
  );
}
