/**
 * Cycle de vie d'une seance : demarrage, validation des series, progression du
 * curseur, cloture. Toutes les mutations passent par `dispatch`, donc chacune
 * est immediatement persistee et synchronisee.
 */
import type { AppState, LiveSession, PlanStep, Program, ProgramSession, SetEntry } from '../types';
import { dispatch, getState } from './state';
import { exerciseName, lastSet, todayIso } from './selectors';

/** Instantane du programme au moment du demarrage : l'editer ensuite ne touche pas la seance engagee. */
export function buildPlan(state: AppState, session: ProgramSession): PlanStep[] {
  return session.items.map((item) => ({ ...item, exerciseName: exerciseName(state, item.exerciseId) }));
}

export function totalSets(plan: PlanStep[]): number {
  return plan.reduce((sum, step) => sum + step.sets, 0);
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
 * Valeurs proposees pour la serie en cours : ce qui a ete fait sur cette meme
 * serie la derniere fois, a defaut le bas de la fourchette du programme.
 * C'est ce qui permet de valider une serie sans rien toucher.
 */
export function suggestion(state: AppState, live: LiveSession): { weight: number; reps: number } {
  const step = live.plan[live.cursor.planIndex];
  if (!step) return { weight: 0, reps: 0 };

  // La meme serie lors de la derniere seance : c'est elle qui porte la montee en
  // charge (40, 60, 80...), qu'une simple reprise de la serie precedente effacerait.
  const previous = lastSet(state, step.exerciseId, live.cursor.setIndex);
  if (previous) return { weight: previous.weight ?? 0, reps: previous.reps ?? step.repMin ?? 8 };

  // Jamais fait : on reprend ce qui vient d'etre porte sur cet exercice aujourd'hui.
  const today = [...live.entries].reverse().find((e) => e.itemId === step.id);
  return {
    weight: today?.weight ?? 0,
    reps: today?.reps ?? step.repMin ?? 8,
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
