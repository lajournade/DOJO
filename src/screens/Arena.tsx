/**
 * L'ecran de seance : une serie, deux compteurs, un bouton.
 * Tout le reste (bandeau, chrono, combo, combattants) est du retour d'information.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { BigStepper } from '../components/BigStepper';
import { ComboMeter, comboLabel } from '../components/ComboMeter';
import { HealthBar, RoundClock } from '../components/HealthBar';
import { ImpactFx, type Hit } from '../components/ImpactFx';
import { RestTimer, useRestCountdown, type Rest } from '../components/RestTimer';
import { RirPicker } from '../components/RirPicker';
import { Sprite, useFrame } from '../components/Sprite';
import { Stage } from '../components/Stage';
import { sfx } from '../fx/audio';
import { useShake } from '../fx/shake';
import { FOE, FOE_FRAME, HERO, HERO_FRAME, HERO_PALETTE, foePalette } from '../fx/sprites';
import { keepAwake, rearmOnVisible, releaseAwake } from '../fx/wakelock';
import { navigate } from '../router';
import { activeProgram, bestWeight } from '../store/selectors';
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

/** Duree de la frame d'attaque et du recul de l'adversaire. */
const STRIKE_MS = 220;

export function Arena() {
  const { state, loaded, status, pending } = useStore();
  const live = state.liveSession;

  const [weight, setWeight] = useState(0);
  const [reps, setReps] = useState(0);
  const [rir, setRir] = useState<number | null>(null);
  const [rest, setRest] = useState<Rest | null>(null);
  const [hits, setHits] = useState<Hit[]>([]);
  const [combo, setCombo] = useState(0);
  const [flash, setFlash] = useState(0);
  const [striking, setStriking] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const { shake, props: shakeProps } = useShake();
  const breath = useFrame(2, 2.5);
  const { left: restLeft, done: restDone } = useRestCountdown(rest);

  const step = live?.plan[live.cursor.planIndex] ?? null;
  const cursorKey = live ? `${live.cursor.planIndex}:${live.cursor.setIndex}` : '';
  const isLastSet = step ? live!.cursor.setIndex >= step.sets : false;

  // La couleur de l'adversaire suit la seance : la meme qu'a la selection.
  const foeIndex = useMemo(() => {
    const program = activeProgram(state);
    const i = program?.sessions.findIndex((s) => s.id === live?.sessionId) ?? -1;
    return i < 0 ? 0 : i;
  }, [state, live?.sessionId]);

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

  const record = useMemo(() => (step ? bestWeight(state, step.exerciseId) : 0), [state, step]);

  const hitId = useRef(0);
  const strikeTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => clearTimeout(strikeTimer.current), []);

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

    // Le heros frappe, l'adversaire encaisse et recule.
    setStriking(true);
    clearTimeout(strikeTimer.current);
    strikeTimer.current = setTimeout(() => setStriking(false), STRIKE_MS) as unknown as number;

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
    <div
      {...shakeProps}
      className={`${shakeProps.className ?? ''} flex h-dvh flex-col overflow-hidden bg-ink`}
    >
      <ImpactFx hits={hits} />

      <header className="pad-top pad-x flex items-center justify-between gap-2 pb-1.5">
        <button
          type="button"
          onClick={() => {
            if (confirm('Abandonner la séance en cours ?')) {
              abortSession();
              navigate('/', { replace: true });
            }
          }}
          className="fight-text text-p1 tracking-[0.2em] text-ash"
        >
          ← quitter
        </button>
        {/* Le reseau peut tomber en pleine seance : on le signale sans jamais interrompre. */}
        {status === 'offline' && (
          <span className="bevel-sm numeric fight-text bg-blood/30 px-1.5 py-0.5 text-p1 text-impact">
            hors ligne {pending}
          </span>
        )}
      </header>

      {/* Le bandeau de combat : l'exercice a gauche, la seance a droite, le chrono au milieu. */}
      <div className="pad-x flex items-start gap-2">
        <HealthBar
          name={`exo ${live.cursor.planIndex + 1}/${live.plan.length}`}
          total={step.sets}
          done={live.cursor.setIndex - 1}
          side="left"
          flash={flash}
        />
        <RoundClock
          seconds={rest && !restDone ? restLeft : total - done}
          resting={rest !== null && !restDone}
        />
        <HealthBar
          name={live.programCode}
          total={total}
          done={done}
          side="right"
          flash={flash}
        />
      </div>

      {/* La scene : le heros frappe, l'adversaire encaisse. */}
      <div className="relative mt-2 border-y-2 border-line">
        <Stage className="h-32">
          <div
            className="transition-transform duration-100"
            style={{ transform: striking ? 'translateX(6px)' : 'none' }}
          >
            <Sprite
              sprite={HERO}
              palette={HERO_PALETTE}
              frame={striking ? HERO_FRAME.hit : breath}
              scale={3}
            />
          </div>
          <div
            className="transition-transform duration-100"
            style={{ transform: striking ? 'translateX(8px)' : 'none' }}
          >
            <Sprite
              sprite={FOE}
              palette={foePalette(foeIndex)}
              frame={striking ? FOE_FRAME.hurt : breath}
              flash={striking}
              scale={3}
            />
          </div>
        </Stage>
        <div className="pointer-events-none absolute bottom-1 left-3">
          <ComboMeter count={combo} />
        </div>
      </div>

      {/* Seule cette zone defile : la barre d'action reste sous le pouce. */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-clip pb-3">
        <motion.section
          key={live.cursor.planIndex}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.25 }}
          className="pad-x mt-3"
        >
          <h1 className="fight-shadow text-p3 font-bold uppercase leading-8 text-bone">
            {step.exerciseName}
          </h1>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Tag tone="blood">
              série {live.cursor.setIndex}/{step.sets}
            </Tag>
            <Tag>{repRange(step)} reps</Tag>
            {target && <Tag>rir {target}</Tag>}
            {record > 0 && <Tag>record {record} kg</Tag>}
            {step.notes && (
              <button
                type="button"
                onClick={() => setShowNotes((v) => !v)}
                className="bevel-sm keycap fight-text bg-ink-3 px-2 py-1 text-p1 text-ash"
              >
                {showNotes ? 'masquer' : 'conseil'}
              </button>
            )}
          </div>

          {showNotes && step.notes && (
            <p className="bevel-sm mt-2 bg-ink-2 p-2.5 text-p2 text-ash">{step.notes}</p>
          )}
        </motion.section>

        {rest && (
          <section className="pad-x mt-3">
            <div className="bevel-sm bg-ink-2 p-2.5">
              <RestTimer
                left={restLeft}
                done={restDone}
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
      <div className="pad-x pad-bottom z-30 border-t-2 border-line bg-ink pt-2.5">
        <button
          type="button"
          onClick={validate}
          className="notch block w-full bg-line p-[3px] transition-transform duration-75
                     active:translate-x-[3px] active:translate-y-[3px]"
        >
          <span className="notch relative flex h-[70px] w-full items-center justify-center overflow-hidden bg-blood">
            <span className="speedlines absolute inset-0 opacity-40" />
            <span className="fight-text fight-shadow relative text-p3 text-bone">
              {isLastSet && live.cursor.planIndex === live.plan.length - 1 ? 'finish him' : 'impact'}
            </span>
          </span>
        </button>
      </div>
    </div>
  );
}

function Tag({ children, tone }: { children: React.ReactNode; tone?: 'blood' | 'impact' }) {
  const skin =
    tone === 'blood'
      ? 'bg-blood text-bone'
      : tone === 'impact'
        ? 'bg-impact text-line'
        : 'bg-ink-3 text-ash';
  return <span className={`bevel-sm label-text px-2 py-1 text-p2 ${skin}`}>{children}</span>;
}

function Small({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bevel-sm keycap label-text bg-ink-2 px-2 py-2 text-p2 text-ash"
    >
      {children}
    </button>
  );
}
