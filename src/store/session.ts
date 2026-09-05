/**
 * Cycle de vie d'une seance : demarrage, validation des series, progression du
 * curseur, cloture. Toutes les mutations passent par `dispatch`, donc chacune
 * est immediatement persistee et synchronisee.
 */
import type { AppState, LiveSession, PlanStep, Program, ProgramSession, SetEntry } from '../types';
import { dispatch, getState } from './state';
import { exerciseName, todayIso, typicalMinutes } from './selectors';
import { advise, gainLabel, type Advice, type Trend } from './progression';

/** Instantane du programme au moment du demarrage : l'editer ensuite ne touche pas la seance engagee. */
export function buildPlan(state: AppState, session: ProgramSession): PlanStep[] {
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
}

export interface SessionPreview {
  steps: StepPreview[];
  sets: number;
  minutes: number;
  /** Vrai quand la duree vient du programme, faux quand elle vient des seances jouees. */
  estimated: boolean;
  /** Nombre d'exercices qui montent aujourd'hui. */
  ups: number;
}

/**
 * L'annonce du combat, avant qu'il soit engage.
 *
 * Le plan est monte comme au demarrage et chaque serie passe par le meme `advise` :
 * ce qui est affiche ici est exactement ce que l'Arena servira au compteur. Aucun
 * etat n'est touche — lire le briefing ne demarre pas de seance.
 */
export function previewSession(state: AppState, session: ProgramSession): SessionPreview {
  const plan = buildPlan(state, session);

  const steps: StepPreview[] = plan.map((step) => {
    const advices: (Advice | null)[] = [];
    for (let i = 1; i <= step.sets; i += 1) advices.push(advise(state, step, i));
    const known = advices.filter((a): a is Advice => a !== null);

    // La serie de travail est la derniere : c'est elle qui porte le RIR, donc le
    // verdict. L'echauffement qui la precede garde ses valeurs et ne monte pas.
    const work = advices[advices.length - 1] ?? known[known.length - 1] ?? null;
    if (!work) {
      return { step, first: 0, work: 0, ramp: false, trend: 'hold', gain: '', known: false };
    }

    return {
      step,
      first: known[0].weight,
      work: work.weight,
      ramp: known.some((a) => a.weight !== work.weight),
      trend: work.trend,
      gain: gainLabel(work),
      known: true,
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
    ups: steps.filter((s) => s.trend !== 'hold').length,
  };
}

export function startSession(program: Program, session: ProgramSession): LiveSession {
  const state = getState();
  const date = todayIso();
  const live: LiveSession = {
    id: `log-${date}-${session.id}-${Date.now().toString(36)}`,
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

/** Curseur suivant : serie d'apres, puis exercice d'apres. */
export function nextCursor(live: LiveSession) {
  const { planIndex, setIndex } = live.cursor;
  const step = live.plan[planIndex];
  if (step && setIndex < step.sets) return { planIndex, setIndex: setIndex + 1 };
  return { planIndex: planIndex + 1, setIndex: 1 };
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

export function addSet(live: LiveSession) {
  const i = live.cursor.planIndex;
  dispatch('session.plan', { planIndex: i, patch: { sets: live.plan[i].sets + 1 } });
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
export function suggestion(state: AppState, live: LiveSession): Advice {
  const step = live.plan[live.cursor.planIndex];
  if (!step) return { weight: 0, reps: 0, trend: 'hold', reason: '' };

  const advice = advise(state, step, live.cursor.setIndex);
  if (advice) return advice;

  // Jamais fait : on reprend ce qui vient d'etre porte sur cet exercice aujourd'hui.
  const today = [...live.entries].reverse().find((e) => e.itemId === step.id);
  return {
    weight: today?.weight ?? 0,
    reps: today?.reps ?? step.repMin ?? 8,
    trend: 'hold',
    reason: '',
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
