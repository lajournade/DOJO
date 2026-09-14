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
import { Plateau } from '../components/Plateau';
import { PowerUp } from '../components/PowerUp';
import { RestTimer, useRestCountdown, type Rest } from '../components/RestTimer';
import { RirPicker } from '../components/RirPicker';
import { Sprite, useFrame } from '../components/Sprite';
import { Stage } from '../components/Stage';
import { sfx } from '../fx/audio';
import { useShake } from '../fx/shake';
import { HERO, HERO_FRAME, costume } from '../fx/sprites';
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
  canPostpone,
  finishSession,
  isFinished,
  logSet,
  moveTo,
  nextCursor,
  postponeStep,
  repRange,
  replaceStep,
  rirTarget,
  suggestion,
  supersetRange,
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
  const [rest, setRest] = useState<Rest | null>(null);
  const [hits, setHits] = useState<Hit[]>([]);
  const [combo, setCombo] = useState(0);
  const [flash, setFlash] = useState(0);
  const [striking, setStriking] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  // La saisie du remplacant : `null` tant que le titre reste un titre.
  const [draftName, setDraftName] = useState<string | null>(null);
  const { shake, props: shakeProps } = useShake();
  const breath = useFrame(2, 2.5);
  const { left: restLeft, done: restDone } = useRestCountdown(rest);

  const step = live?.plan[live.cursor.planIndex] ?? null;
  // L'identifiant plutot que la position : reporter un exercice change ce que le
  // curseur pointe sans le deplacer, et les compteurs doivent suivre. L'exercice
  // aussi : remplace sur place, le pas garde son identifiant mais change de nom.
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
  // et l'annonce se rejouerait a chaque tour, son compris. Cle par identifiant et non
  // par position : reporter un exercice deplace tout ce qui le suit.
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
  const chained = step.restSec === 0 && nextCursor(live).planIndex < live.plan.length;
  const upcoming = chained ? live.plan[nextCursor(live).planIndex] : null;
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

    // C'est le curseur suivant qui sait si le combat s'arrete la : dans un superset,
    // la derniere serie de la seance n'est pas forcement celle du dernier exercice.
    const lastOfSession = nextCursor(live).planIndex >= live.plan.length;
    // Un repos nul est un enchainement, pas une pause : l'afficher ferait sonner la
    // cloche entre les deux mouvements de la paire.
    setRest(
      lastOfSession || step.restSec === 0
        ? null
        : { startedAt: Date.now(), duration: step.restSec },
    );
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

      {/* La scene : le combattant seul, frais puis fatigue passee la moitie de la
          seance ; chaque serie validee le fait flasher et bondir. */}
      <div className="relative mt-2 border-y-2 border-line">
        <Stage className="h-40" center>
          <div
            className="transition-transform duration-100"
            style={{ transform: striking ? 'translateY(-6px)' : 'none' }}
          >
            <Sprite
              sprite={HERO}
              palette={costume(state.user.palette)}
              frame={(total && done * 2 >= total ? HERO_FRAME.tired : HERO_FRAME.fresh) + breath}
              flash={striking}
              scale={2}
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
          key={step.id}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.25 }}
          className="pad-x mt-3"
        >
          {draftName === null ? (
            <h1 className="fight-shadow text-p3 font-bold uppercase leading-8 text-bone">
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
          {/* Passer un membre de superset seul laisserait la paire boiteuse : on saute le groupe. */}
          <Small onClick={() => moveTo(supersetRange(live.plan, live.cursor.planIndex)[1] + 1)}>
            passer l'exercice
          </Small>
          {/* La machine est prise : le suivant d'abord, on y revient apres. */}
          {canPostpone(live) && (
            <Small
              onClick={() => {
                postponeStep(live);
                setRest(null);
                sfx.select();
              }}
            >
              reporter
            </Small>
          )}
          {/* La machine ne se liberera pas : un autre exercice a la place, pour cette seance. */}
          {draftName === null && (
            <Small
              onClick={() => {
                setDraftName('');
                setRest(null);
              }}
            >
              remplacer
            </Small>
          )}
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
              {nextCursor(live).planIndex >= live.plan.length ? 'finish him' : 'impact'}
            </span>
          </span>
        </button>
      </div>
    </div>
  );
}

/**
 * Le titre devenu cellule : un nom se tape, le catalogue le complete, Entree valide.
 * Un nom vide ne remplace rien — c'est la meme chose qu'annuler.
 */
function ExerciseInput({
  value,
  names,
  onChange,
  onCancel,
  onSubmit,
}: {
  value: string;
  names: string[];
  onChange: (v: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const submit = () => (value.trim() ? onSubmit() : onCancel());
  return (
    <div className="bevel-sm flex items-center gap-2 bg-ink-2 p-2">
      <input
        autoFocus
        list="exercices"
        value={value}
        placeholder="nom de l'exercice"
        enterKeyHint="done"
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') onCancel();
        }}
        className="min-w-0 flex-1 bg-transparent text-p2 font-bold uppercase text-bone outline-none placeholder:text-ash/50"
      />
      <datalist id="exercices">
        {names.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <button
        type="button"
        onClick={submit}
        className="bevel-sm keycap h-9 w-9 shrink-0 bg-impact text-p2 text-line"
      >
        ✓
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="bevel-sm keycap h-9 w-9 shrink-0 bg-ink-3 text-p2 text-ash"
      >
        ✕
      </button>
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
