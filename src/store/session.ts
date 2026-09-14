/**
 * Cycle de vie d'une seance : demarrage, validation des series, progression du
 * curseur, cloture. Toutes les mutations passent par `dispatch`, donc chacune
 * est immediatement persistee et synchronisee.
 */
import type { Cursor, LiveSession, PlanStep, Program, ProgramSession, SetEntry, UserView } from '../types';
import { dispatch, getView } from './state';
import { findExercise, slug } from './programs';
import { exerciseName, knownSets, todayIso, typicalMinutes } from './selectors';
import { advise, gainLabel, plateau, type Advice, type Plateau, type Trend } from './progression';

/** Instantane du programme au moment du demarrage : l'editer ensuite ne touche pas la seance engagee. */
export function buildPlan(state: UserView, session: ProgramSession): PlanStep[] {
  return session.items.map((item) => ({ ...item, exerciseName: exerciseName(state, item.exerciseId) }));
}

export function totalSets(plan: PlanStep[]): number {
  return plan.reduce((sum, step) => sum + step.sets, 0);
}

/**
 * Duree d'execution d'une serie, repos exclu. C'est la seule part que le programme
 * ne dit pas : tout le reste de l'estimation vient des `restSec` prescrits.
 */
const SET_SEC = 40;

/** Ce qu'un exercice va couter aujourd'hui, tel que l'Arena le proposera. */
export interface StepPreview {
  step: PlanStep;
  /** Charge de la premiere serie : ce qu'on met sur la barre en arrivant. */
  first: number;
  /** Charge de la serie de travail — la derniere, celle qui porte le RIR. */
  work: number;
  /** Les charges montent d'une serie a l'autre (la rampe 40 / 60 / 80 du squat). */
  ramp: boolean;
  trend: Trend;
  /** « +2,5 kg », « +1 rep », ou vide. */
  gain: string;
  /** Faux tant que l'exercice n'a jamais ete pratique : rien a proposer. */
  known: boolean;
  /** Renseigne quand la charge ne bouge plus depuis plusieurs seances. */
  plateau: Plateau | null;
}

export interface SessionPreview {
  steps: StepPreview[];
  sets: number;
  minutes: number;
  /** Vrai quand la duree vient du programme, faux quand elle vient des seances jouees. */
  estimated: boolean;
  /** Nombre d'exercices qui montent aujourd'hui. */
  ups: number;
  /** Nombre d'exercices dont la charge est transposee : la fourchette a change. */
  shifts: number;
  /** Nombre d'exercices en palier : la contrepartie de `ups`. */
  stuck: number;
}

/**
 * L'annonce du combat, avant qu'il soit engage.
 *
 * Le plan est monte comme au demarrage et chaque serie passe par le meme `advise` :
 * ce qui est affiche ici est exactement ce que l'Arena servira au compteur. Aucun
 * etat n'est touche — lire le briefing ne demarre pas de seance.
 */
export function previewSession(state: UserView, session: ProgramSession): SessionPreview {
  const plan = buildPlan(state, session);

  const steps: StepPreview[] = plan.map((step) => {
    const advices: (Advice | null)[] = [];
    for (let i = 1; i <= step.sets; i += 1) advices.push(advise(state, step, i));
    const known = advices.filter((a): a is Advice => a !== null);

    // La serie de travail est la derniere : c'est elle qui porte le RIR, donc le
    // verdict. L'echauffement qui la precede garde ses valeurs et ne monte pas.
    const work = advices[advices.length - 1] ?? known[known.length - 1] ?? null;
    if (!work) {
      return {
        step,
        first: 0,
        work: 0,
        ramp: false,
        trend: 'hold',
        gain: '',
        known: false,
        plateau: null,
      };
    }

    return {
      step,
      first: known[0].weight,
      work: work.weight,
      ramp: known.some((a) => a.weight !== work.weight),
      trend: work.trend,
      gain: gainLabel(work),
      known: true,
      // Le dojo propose deja une montee : quoi qu'en dise l'historique, rien n'est bloque.
      plateau: work.trend === 'hold' ? plateau(state, step) : null,
    };
  });

  // Une seance deja chronometree en dit plus long que n'importe quelle formule.
  const measured = typicalMinutes(state, session.id);
  const planned = plan.reduce((sec, step) => sec + step.sets * (SET_SEC + step.restSec), 0);
  // Le dernier repos n'a pas lieu : la seance s'arrete sur la derniere serie.
  const lastRest = plan.length ? plan[plan.length - 1].restSec : 0;

  return {
    steps,
    sets: totalSets(plan),
    minutes: measured ?? Math.max(1, Math.round((planned - lastRest) / 60)),
    estimated: measured === null,
    ups: steps.filter((s) => s.trend === 'up' || s.trend === 'reps').length,
    shifts: steps.filter((s) => s.trend === 'shift').length,
    stuck: steps.filter((s) => s.plateau !== null).length,
  };
}

export function startSession(program: Program, session: ProgramSession): LiveSession {
  const state = getView();
  const date = todayIso();
  const live: LiveSession = {
    id: `log-${date}-${session.id}-${Date.now().toString(36)}`,
    userId: state.user.id,
    programCode: `${program.code}-${session.code}`,
    sessionId: session.id,
    date,
    startedAt: new Date().toISOString(),
    endedAt: null,
    entries: [],
    plan: buildPlan(state, session),
    cursor: { planIndex: 0, setIndex: 1 },
  };
  dispatch('session.start', { session: live });
  return live;
}

/**
 * Les bornes du superset auquel appartient un exercice : les items *consecutifs*
 * qui portent la meme lettre. Un exercice seul est son propre groupe, ce qui
 * laisse tout le reste du code s'ecrire sans distinguer les deux cas.
 */
export function supersetRange(plan: PlanStep[], planIndex: number): [number, number] {
  const group = plan[planIndex]?.supersetGroup ?? null;
  if (!group) return [planIndex, planIndex];

  let first = planIndex;
  while (first > 0 && (plan[first - 1].supersetGroup ?? null) === group) first -= 1;
  let last = planIndex;
  while (last < plan.length - 1 && (plan[last + 1].supersetGroup ?? null) === group) last += 1;
  return [first, last];
}

/** Series deja validees sur un exercice de la seance. */
const doneSets = (live: LiveSession, planIndex: number) =>
  live.entries.filter((e) => e.itemId === live.plan[planIndex].id).length;

/**
 * La premiere serie encore a jouer a partir d'un groupe, en entrant dedans.
 *
 * Dans le cas nominal c'est sa premiere serie : rien n'a ete joue. Mais un exercice
 * reporte a la deuxieme serie — la machine prise pendant le repos — garde ses series
 * validees dans le journal, et l'on y revient la ou on l'avait laisse plutot que de
 * rejouer la premiere. Un groupe entierement joue est traverse.
 */
export function resumeCursor(live: LiveSession, planIndex: number): Cursor {
  if (planIndex >= live.plan.length) return { planIndex, setIndex: 1 };

  const [first, last] = supersetRange(live.plan, planIndex);
  const rounds = Math.max(...live.plan.slice(first, last + 1).map((s) => s.sets));
  for (let round = 1; round <= rounds; round += 1) {
    for (let i = first; i <= last; i += 1) {
      if (round <= live.plan[i].sets && doneSets(live, i) < round) return { planIndex: i, setIndex: round };
    }
  }
  return resumeCursor(live, last + 1);
}

/**
 * Curseur suivant.
 *
 * Hors superset : serie d'apres, puis exercice d'apres. Dans un superset, on
 * tourne — A1 s1, A2 s1, A1 s2 — jusqu'a epuiser le tour le plus long ; un
 * exercice qui a moins de series que son partenaire est simplement saute.
 */
export function nextCursor(live: LiveSession): Cursor {
  const { planIndex, setIndex } = live.cursor;
  const step = live.plan[planIndex];
  if (!step) return { planIndex: planIndex + 1, setIndex: 1 };

  const [first, last] = supersetRange(live.plan, planIndex);
  if (first === last) {
    if (setIndex < step.sets) return { planIndex, setIndex: setIndex + 1 };
    return resumeCursor(live, planIndex + 1);
  }

  const rounds = Math.max(...live.plan.slice(first, last + 1).map((s) => s.sets));
  for (let i = planIndex + 1, round = setIndex; round <= rounds; i += 1) {
    // Fin de la ronde : on repart du premier exercice de la paire, un tour plus loin.
    if (i > last) {
      i = first - 1;
      round += 1;
      continue;
    }
    if (round <= live.plan[i].sets) return { planIndex: i, setIndex: round };
  }
  return resumeCursor(live, last + 1);
}

export const isFinished = (live: LiveSession) => live.cursor.planIndex >= live.plan.length;

export function logSet(live: LiveSession, values: { reps: number; weight: number; rir: number | null }) {
  const step = live.plan[live.cursor.planIndex];
  const entry: SetEntry = {
    itemId: step.id,
    exerciseId: step.exerciseId,
    exerciseName: step.exerciseName,
    setIndex: live.cursor.setIndex,
    reps: values.reps,
    weight: values.weight,
    rir: values.rir,
  };
  dispatch('set.log', { entry, cursor: nextCursor(live) });
}

export function moveTo(planIndex: number, setIndex = 1) {
  dispatch('session.cursor', { cursor: { planIndex, setIndex } });
}

/** Il reste quelque chose a jouer avant : on peut reporter l'exercice en cours. */
export const canPostpone = (live: LiveSession) =>
  supersetRange(live.plan, live.cursor.planIndex)[1] + 1 < live.plan.length;

/**
 * La machine est prise : l'exercice en cours passe derriere le suivant, et le combat
 * reprend sur celui-ci. On revient sur l'exercice reporte une fois l'autre joue —
 * c'est le simple ordre du plan qui y ramene. Un superset se deplace d'un bloc, comme
 * partout ailleurs. Un second appui, machine toujours prise, le repousse d'un cran.
 */
export function postponeStep(live: LiveSession) {
  if (!canPostpone(live)) return;
  const [first, last] = supersetRange(live.plan, live.cursor.planIndex);
  const [nextFirst, nextLast] = supersetRange(live.plan, last + 1);
  const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, k) => from + k);
  const order = [
    ...range(0, first - 1),
    ...range(nextFirst, nextLast),
    ...range(first, last),
    ...range(nextLast + 1, live.plan.length - 1),
  ];
  dispatch('session.reorder', { order, cursor: { planIndex: first, setIndex: 1 } });
}

/**
 * La machine ne se libere pas : l'exercice en cours cede sa place a un autre, pour cette
 * seance seulement — le programme n'en sait rien. Un exercice deja joue apporte son
 * nombre de series, et `advise` retrouvera sa charge tout seul dans l'historique. Faute
 * d'historique, c'est ce qui etait au compteur qui reste (`carry`), a corriger a la main ;
 * un nom inconnu entre en plus au catalogue, pour etre propose la prochaine fois. Le
 * conseil d'execution parlait de l'ancien exercice : il ne suit pas.
 */
export function replaceStep(live: LiveSession, name: string, counter: { weight: number; reps: number }) {
  const label = name.trim();
  if (!label) return;
  const state = getView();
  const step = live.plan[live.cursor.planIndex];
  if (!step) return;

  const existing = findExercise(state.exercises, label);
  const exerciseId = existing?.id ?? slug(label);
  if (!exerciseId || exerciseId === step.exerciseId) return;
  if (!existing) dispatch('exercise.upsert', { exercise: { id: exerciseId, name: label } });

  // Jamais moins de series que celle ou l'on se trouve : le curseur doit rester dans le plan.
  const known = knownSets(state, exerciseId);
  const patch: Partial<PlanStep> = {
    exerciseId,
    exerciseName: existing?.name ?? label,
    sets: known === null ? step.sets : Math.max(known, live.cursor.setIndex),
    carry: counter,
    notes: '',
  };
  dispatch('session.plan', { planIndex: live.cursor.planIndex, patch });
}

/** Une serie de plus — sur toute la paire quand on est dans un superset, sinon elle se desaccorde. */
export function addSet(live: LiveSession) {
  const [first, last] = supersetRange(live.plan, live.cursor.planIndex);
  for (let i = first; i <= last; i += 1) {
    dispatch('session.plan', { planIndex: i, patch: { sets: live.plan[i].sets + 1 } });
  }
}

export function undoLastSet(live: LiveSession) {
  if (!live.entries.length) return;
  const last = live.entries[live.entries.length - 1];
  const planIndex = live.plan.findIndex((s) => s.id === last.itemId);
  dispatch('set.remove', { index: live.entries.length - 1 });
  if (planIndex >= 0) moveTo(planIndex, last.setIndex);
}

export function finishSession() {
  dispatch('session.finish', { endedAt: new Date().toISOString() });
}

export function abortSession() {
  dispatch('session.abort');
}

/**
 * Valeurs proposees pour la serie en cours. Le verdict vient de `advise` : la
 * meme serie lors de la derniere seance — c'est elle qui porte la montee en
 * charge (40, 60, 80...), qu'une simple reprise de la serie precedente
 * effacerait — augmentee de ce que dit le RIR. C'est ce qui permet de valider
 * une serie sans rien toucher, et de progresser malgre tout.
 */
export function suggestion(state: UserView, live: LiveSession): Advice {
  const step = live.plan[live.cursor.planIndex];
  if (!step) return { weight: 0, reps: 0, trend: 'hold', reason: '', from: 0 };

  const advice = advise(state, step, live.cursor.setIndex);
  if (advice) return advice;

  // Jamais fait : on reprend ce qui vient d'etre porte sur cet exercice aujourd'hui —
  // ou, s'il vient de remplacer un autre, ce que le compteur affichait a ce moment-la.
  const today = [...live.entries].reverse().find((e) => e.itemId === step.id);
  const seed = today ?? step.carry ?? null;
  return {
    weight: seed?.weight ?? 0,
    reps: seed?.reps ?? step.repMin ?? 8,
    trend: 'hold',
    reason: '',
    from: seed?.weight ?? 0,
  };
}

/** Fourchette de repetitions affichee, "8–10" ou "8". */
export function repRange(step: PlanStep): string {
  if (step.repMin === null) return '—';
  return step.repMax && step.repMax !== step.repMin ? `${step.repMin}–${step.repMax}` : `${step.repMin}`;
}

export function rirTarget(step: PlanStep): string | null {
  if (step.targetRirMin === null) return null;
  return step.targetRirMax && step.targetRirMax !== step.targetRirMin
    ? `${step.targetRirMin}–${step.targetRirMax}`
    : `${step.targetRirMin}`;
}
