/**
 * L'ecran de seance : une serie, deux compteurs, un bouton.
 * Tout le reste (bandeau, chrono, combo, combattants) est du retour d'information.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { BigStepper } from '../components/BigStepper';
import { ComboMeter, comboLabel } from '../components/ComboMeter';
import { ExerciseInput } from '../components/ExerciseInput';
import { HealthBar, RoundClock } from '../components/HealthBar';
import { ImpactFx, type Hit } from '../components/ImpactFx';
import { Plateau } from '../components/Plateau';
import { PowerUp } from '../components/PowerUp';
import { RirPicker } from '../components/RirPicker';
import { SessionMap } from '../components/SessionMap';
import { Sprite, useFrame } from '../components/Sprite';
import { sfx } from '../fx/audio';
import { useShake } from '../fx/shake';
import { HERO, HERO_BUST, HERO_FRAME, costume } from '../fx/sprites';
import { keepAwake, rearmOnVisible, releaseAwake } from '../fx/wakelock';
import { navigate } from '../router';
import {
  STEP_KG,
  deloadWeight,
  gainLabel,
  plateau,
  type Advice,
} from '../store/progression';
import { bestWeight } from '../store/selectors';
import {
  abortSession,
  addSet,
  appendStep,
  finishSession,
  isFinished,
  jumpTo,
  logSet,
  nextCursor,
  repRange,
  replaceStep,
  rirTarget,
  suggestion,
  totalSets,
  undoLastSet,
} from '../store/session';
import { useStore } from '../store/state';

/** Duree du flash et du bond a chaque serie validee. */
const STRIKE_MS = 220;

export function Arena() {
  const { state, loaded, status, pending } = useStore();
  const live = state.liveSession;

  const [weight, setWeight] = useState(0);
  const [reps, setReps] = useState(0);
  const [rir, setRir] = useState<number | null>(null);
  const [advice, setAdvice] = useState<Advice | null>(null);
  const [banner, setBanner] = useState(false);
  const [deloaded, setDeloaded] = useState(false);
  const [hits, setHits] = useState<Hit[]>([]);
  const [combo, setCombo] = useState(0);
  const [flash, setFlash] = useState(0);
  const [striking, setStriking] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  // La carte de la seance, par-dessus l'arene : pour aller jouer un autre exercice.
  const [showMap, setShowMap] = useState(false);
  // La saisie du remplacant : `null` tant que le titre reste un titre.
  const [draftName, setDraftName] = useState<string | null>(null);
  const { shake, props: shakeProps } = useShake();
  const breath = useFrame(2, 2.5);

  const step = live?.plan[live.cursor.planIndex] ?? null;
  // L'identifiant plutot que la position, et l'exercice avec : remplace sur place,
  // le pas garde son identifiant mais change de nom, et les compteurs doivent suivre.
  const stepKey = step ? `${step.id}:${step.exerciseId}` : '';
  const cursorKey = live && step ? `${stepKey}:${live.cursor.setIndex}` : '';
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

  // Un exercice n'a qu'une annonce, a sa premiere serie : la montee en charge, ou le
  // palier. Les deux s'excluent — l'un veut `hold`, l'autre non. Un ensemble, et non
  // un seul index : dans un superset le curseur revient sur un exercice deja annonce,
  // et l'annonce se rejouerait a chaque tour, son compris — de meme quand on revient
  // par la carte sur un exercice quitte en route.
  const announced = useRef(new Set<string>());

  /**
   * Les exercices decharges a la main pendant cette seance : identifiant du pas → la
   * charge du palier. La baisse se reporte sur les series suivantes du meme exercice, mais
   * seulement sur celles qui portaient cette charge : l'echauffement 40 / 60 / 80
   * garde ses paliers, comme le fait deja `advise`. Rien n'est ecrit au journal —
   * la seance suivante repartira de l'historique.
   */
  const deloads = useRef(new Map<string, number>());

  // Chaque nouvelle serie repart de ce qui a ete fait la derniere fois.
  useEffect(() => {
    if (!live || !step) return;
    const s = suggestion(state, live);
    const cut = deloads.current.get(stepKey);
    setWeight(cut !== undefined && s.weight === cut ? deloadWeight(s.weight) : s.weight);
    setReps(s.reps);
    setRir(null);
    setShowNotes(false);
    setDraftName(null);
    setAdvice(s);
    setDeloaded(cut !== undefined);

    // Le meme palier que ci-dessous, relu ici : `advice` ne sera a jour qu'au rendu suivant.
    const stallAtCursor = s.trend === 'hold' ? plateau(state, step) : null;
    const worthAnnouncing =
      (s.trend !== 'hold' || (stallAtCursor !== null && cut === undefined)) &&
      !announced.current.has(stepKey);
    setBanner(worthAnnouncing);
    if (worthAnnouncing) {
      announced.current.add(stepKey);
      if (s.trend === 'hold') sfx.warn();
      else sfx.powerup();
    }
    // Volontairement limite au curseur : on ne veut pas ecraser une saisie en cours.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorKey]);

  const record = useMemo(() => (step ? bestWeight(state, step.exerciseId) : 0), [state, step]);
  // Le dojo propose deja une montee : quoi qu'en dise l'historique, rien n'est bloque.
  const stall = useMemo(
    () => (step && advice?.trend === 'hold' ? plateau(state, step) : null),
    [state, step, advice],
  );

  const hitId = useRef(0);
  const strikeTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => clearTimeout(strikeTimer.current), []);

  if (!live || !step) return null;

  const done = live.entries.length;
  const total = totalSets(live.plan);
  // Dans un superset, on doit savoir avant de valider qu'on enchaine, et sur quoi.
  const next = nextCursor(live);
  const chained =
    next.planIndex < live.plan.length &&
    next.planIndex !== live.cursor.planIndex &&
    !!step.supersetGroup &&
    live.plan[next.planIndex].supersetGroup === step.supersetGroup;
  const upcoming = chained ? live.plan[next.planIndex] : null;
  const target = rirTarget(step);
  // La proposition ne tient que tant qu'elle decrit la valeur au compteur : des
  // que le pouce touche la charge, elle s'efface plutot que de mentir.
  const bump = advice && advice.trend !== 'hold' && weight === advice.weight ? advice : null;

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

    // Le combattant encaisse la serie : flash et bond.
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
  };

  return (
    <div
      {...shakeProps}
      className={`${shakeProps.className ?? ''} flex h-dvh flex-col overflow-hidden bg-ink`}
    >
      <ImpactFx hits={hits} />

      {showMap && (
        <SessionMap
          live={live}
          names={state.exercises.map((e) => e.name)}
          onClose={() => setShowMap(false)}
          onPick={(i) => {
            jumpTo(live, i);
            setShowMap(false);
            sfx.select();
          }}
          onAdd={(name) => {
            // Un exercice de plus, et on y va : meme depart que le saut.
            appendStep(live, name);
            setShowMap(false);
            sfx.select();
          }}
        />
      )}

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
        <div className="flex items-center gap-2">
          {/* Le reseau peut tomber en pleine seance : on le signale sans jamais interrompre. */}
          {status === 'offline' && (
            <span className="bevel-sm numeric fight-text bg-blood/30 px-1.5 py-0.5 text-p1 text-impact">
              hors ligne {pending}
            </span>
          )}
          {/* La seance entiere, et le saut vers un autre exercice quand la machine est prise. */}
          <button
            type="button"
            onClick={() => setShowMap(true)}
            className="fight-text text-p1 tracking-[0.2em] text-ash"
          >
            carte →
          </button>
        </div>
      </header>

      {/* Le bandeau de combat, a la Street Fighter : le portrait du combattant, ses
          deux barres de vie empilees — l'exercice, puis la seance —, le chrono au bout.
          Frais jusqu'a la moitie de la seance, fatigue ensuite ; chaque serie
          validee le fait flasher. */}
      <div className="pad-x flex items-center gap-2 border-b-2 border-line pb-2">
        <div className="bevel-in flex shrink-0 overflow-hidden bg-ink">
          <Sprite
            sprite={HERO}
            palette={costume(state.user.palette)}
            frame={(total && done * 2 >= total ? HERO_FRAME.tired : HERO_FRAME.fresh) + breath}
            flash={striking}
            scale={3}
            cropX={HERO_BUST.x}
            cropY={HERO_BUST.y}
            cropW={HERO_BUST.w}
            cropH={HERO_BUST.h}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <HealthBar
            name={`exo ${live.cursor.planIndex + 1}/${live.plan.length}`}
            total={step.sets}
            done={live.cursor.setIndex - 1}
            side="left"
            flash={flash}
          />
          <HealthBar name={live.programCode} total={total} done={done} side="left" flash={flash} />
        </div>
        <RoundClock seconds={total - done} />
      </div>

      {/* Seule cette zone defile : la barre d'action reste sous le pouce. */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-clip pb-3">
        <motion.section
          key={step.id}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.25 }}
          className="pad-x mt-3"
        >
          {/* Le titre a gauche, le compteur de combo a droite quand il y en a un. */}
          <div className="flex items-start justify-between gap-2">
            {draftName === null ? (
              <h1 className="fight-shadow min-w-0 text-p3 font-bold uppercase leading-8 text-bone">
                {step.exerciseName}
              </h1>
            ) : (
              <ExerciseInput
                value={draftName}
                names={state.exercises.map((e) => e.name)}
                onChange={setDraftName}
                onCancel={() => setDraftName(null)}
                onSubmit={() => {
                  // Le remplacant herite du compteur tel qu'il est, retouches comprises.
                  replaceStep(live, draftName, { weight, reps });
                  setDraftName(null);
                  sfx.select();
                }}
              />
            )}
            <ComboMeter count={combo} />
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {step.supersetGroup && <Tag tone="impact">superset {step.supersetGroup}</Tag>}
            {upcoming && <Tag>puis {upcoming.exerciseName}</Tag>}
            <Tag tone="blood">
              série {live.cursor.setIndex}/{step.sets}
            </Tag>
            <Tag>{repRange(step)} reps</Tag>
            {target && <Tag>rir {target}</Tag>}
            {record > 0 && <Tag>record {record} kg</Tag>}
            {/* Puis une simple trace sur les series suivantes. */}
            {bump && !banner && (
              <Tag tone="impact">
                {bump.trend === 'shift' ? 'cycle' : 'montée'} {gainLabel(bump)}
              </Tag>
            )}
            {deloaded ? (
              <Tag tone="jade">déchargé −{String(STEP_KG).replace('.', ',')} kg</Tag>
            ) : (
              stall && !banner && <Tag tone="warn">bloqué {stall.sessions} séances</Tag>
            )}
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

          {/* La montee en charge : un moment fort a la premiere serie de l'exercice. */}
          {bump && banner && (
            <div className="mt-2">
              <PowerUp trend={bump.trend} gain={gainLabel(bump)} reason={bump.reason} />
            </div>
          )}

          {/* Le palier, a la meme place : ce qui ne monte plus se dit aussi fort. */}
          {stall && banner && !deloaded && (
            <div className="mt-2">
              <Plateau
                sessions={stall.sessions}
                weight={deloadWeight(stall.weight)}
                onDeload={() => {
                  deloads.current.set(stepKey, stall.weight);
                  // La baisse ne touche que le poids de travail : sur une rampe, on la
                  // decide des l'echauffement, mais le compteur n'en bouge qu'a la
                  // serie qui portait la charge bloquee.
                  setWeight((w) => (w === stall.weight ? deloadWeight(w) : w));
                  setDeloaded(true);
                  setBanner(false);
                  sfx.select();
                }}
              />
            </div>
          )}
        </motion.section>

        <section className="pad-x mt-3 grid gap-2">
          <BigStepper
            label="charge"
            unit="kg"
            value={weight}
            step={2.5}
            min={-100}
            tone={bump?.trend === 'up' ? 'impact' : 'blood'}
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
          {/* La machine ne se liberera pas : un autre exercice a la place, pour cette seance. */}
          {draftName === null && (
            <Small onClick={() => setDraftName('')}>remplacer</Small>
          )}
          {live.entries.length > 0 && (
            <Small
              onClick={() => {
                undoLastSet(live);
                setCombo(0);
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
              {next.planIndex >= live.plan.length ? 'finish him' : 'impact'}
            </span>
          </span>
        </button>
      </div>
    </div>
  );
}

function Tag({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: 'blood' | 'impact' | 'jade' | 'warn';
}) {
  // `warn` clignote et prend le rouge vif : a cote du `blood` mat de « serie 1/4 »,
  // c'est le battement qui le distingue, pas la teinte seule.
  const skin =
    tone === 'blood'
      ? 'bg-blood text-bone'
      : tone === 'impact'
        ? 'bg-impact text-line'
        : tone === 'jade'
          ? 'bg-jade text-line'
          : tone === 'warn'
            ? 'pulsing bg-blood-hot text-bone'
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
