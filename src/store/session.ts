/**
 * Cycle de vie d'une seance : demarrage, validation des series, progression du
 * curseur, cloture. Toutes les mutations passent par `dispatch`, donc chacune
 * est immediatement persistee et synchronisee.
 */
import type {
  Cursor,
  LiveSession,
  PlanStep,
  Program,
  ProgramGoal,
  ProgramSession,
  SetEntry,
  UserView,
} from '../types';
import { entryMatchesStep, isAbandoned, isDone } from '../../shared/entries.mjs';
import { dispatch, getView } from './state';
import { blankItem, findExercise, slug } from './programs';
import { exerciseName, historyOf, knownSets, todayIso, typicalMinutes } from './selectors';
import { advise, gainLabel, plateau, type Advice, type Plateau, type Trend } from './progression';

/** Instantane du programme au moment du demarrage : l'editer ensuite ne touche pas la seance engagee. */
export function buildPlan(state: UserView, session: ProgramSession): PlanStep[] {
  return session.items.map((item) => ({
    ...item,
    exerciseName: exerciseName(state, item.exerciseId),
    tracking: state.exercises.find((e) => e.id === item.exerciseId)?.tracking ?? 'reps',
  }));
}

export function totalSets(plan: PlanStep[]): number {
  return plan.reduce((sum, step) => sum + step.sets, 0);
}

/** Forfait d'une serie, execution et recuperation comprises : le programme ne dit rien de plus. */
const SET_SEC = 120;

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
  duration: number | null;
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
    if (step.tracking === 'duration') {
      const previous = historyOf(state, step.exerciseId).flatMap((row) => row.entries).reverse().find((entry) => entry.reps !== 0);
      return {
        step, first: 0, work: 0, ramp: false, trend: 'hold', gain: '',
        known: previous !== undefined, plateau: null,
        duration: previous ? previous.seconds ?? previous.reps ?? null : null,
      };
    }
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
        duration: null,
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
      duration: null,
    };
  });

  // Une seance deja chronometree en dit plus long que n'importe quelle formule.
  const measured = typicalMinutes(state, session.id);

  return {
    steps,
    sets: totalSets(plan),
    minutes: measured ?? Math.max(1, Math.round((totalSets(plan) * SET_SEC) / 60)),
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

/** Une séance libre commence vide, sans modifier le programme du joueur. */
export function startFreeSession(): LiveSession {
  const state = getView();
  if (state.liveSession) return state.liveSession;
  const live: LiveSession = {
    id: `log-free-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    userId: state.user.id,
    mode: 'free',
    programCode: 'LIBRE',
    sessionId: null,
    date: todayIso(),
    startedAt: new Date().toISOString(),
    endedAt: null,
    entries: [],
    plan: [],
    cursor: { planIndex: 0, setIndex: 1 },
  };
  dispatch('session.start', { session: live });
  return live;
}

/** Rouvre uniquement le journal encore éligible au moment du clic. */
export function resumeSession(logId: string): boolean {
  dispatch('session.resume', { logId, date: todayIso(), resumedAt: new Date().toISOString() });
  return getView().liveSession?.id === logId;
}

/** Ajoute une ronde à un exercice terminé, puis reprend son groupe. */
export function extendStep(live: LiveSession, planIndex: number) {
  if (isAbandoned(live.entries, live.plan[planIndex])) return;
  addSet({ ...live, cursor: { planIndex, setIndex: 1 } });
  const updated = getView().liveSession;
  if (updated) jumpTo(updated, planIndex);
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
export const doneSets = (live: LiveSession, planIndex: number) =>
  live.entries.filter((e) => entryMatchesStep(e, live.plan[planIndex]) && isDone(e)).length;

/** Ou en est un exercice : rien, entame, ou toutes ses series au journal. */
export function stepStatus(live: LiveSession, planIndex: number): 'todo' | 'started' | 'done' | 'abandoned' {
  if (isAbandoned(live.entries, live.plan[planIndex])) return 'abandoned';
  const done = doneSets(live, planIndex);
  if (live.mode === 'free') return done > 0 ? 'started' : 'todo';
  if (done >= live.plan[planIndex].sets) return 'done';
  return done > 0 ? 'started' : 'todo';
}

/**
 * La premiere serie encore a jouer dans le groupe d'un exercice, en y entrant.
 *
 * Dans le cas nominal c'est sa premiere serie : rien n'a ete joue. Mais un exercice
 * quitte a la deuxieme serie — la machine prise entre deux series — garde ses series
 * validees dans le journal, et l'on y revient la ou on l'avait laisse plutot que de
 * rejouer la premiere. Un superset se parcourt en rondes, comme `nextCursor`.
 * `null` quand le groupe est entierement joue.
 */
export function groupCursor(live: LiveSession, planIndex: number): Cursor | null {
  if (live.mode === 'free') return isAbandoned(live.entries, live.plan[planIndex]) ? null
    : { planIndex, setIndex: Math.max(0, ...live.entries.filter((e) => entryMatchesStep(e, live.plan[planIndex])).map((e) => e.setIndex)) + 1 };
  const [first, last] = supersetRange(live.plan, planIndex);
  const rounds = Math.max(...live.plan.slice(first, last + 1).map((s) => s.sets));
  for (let round = 1; round <= rounds; round += 1) {
    for (let i = first; i <= last; i += 1) {
      if (!isAbandoned(live.entries, live.plan[i]) && round <= live.plan[i].sets && !live.entries.some((e) => entryMatchesStep(e, live.plan[i]) && e.setIndex === round)) return { planIndex: i, setIndex: round };
    }
  }
  return null;
}

/**
 * Le premier groupe encore a jouer a partir d'un index, et la serie ou l'on y entre.
 * Un groupe entierement joue est traverse ; plus rien a jouer, le curseur sort du plan.
 */
export function resumeCursor(live: LiveSession, from: number): Cursor {
  for (let i = from; i < live.plan.length; i = supersetRange(live.plan, i)[1] + 1) {
    const cursor = groupCursor(live, i);
    if (cursor) return cursor;
  }
  return { planIndex: live.plan.length, setIndex: 1 };
}

/**
 * Curseur suivant, une fois la serie en cours validee.
 *
 * Hors superset : serie d'apres, puis exercice d'apres. Dans un superset, on
 * tourne — A1 s1, A2 s1, A1 s2 — jusqu'a epuiser le tour le plus long ; un
 * exercice qui a moins de series que son partenaire est simplement saute.
 *
 * Un groupe fini, on repart du *premier* exercice non termine du plan, pas du
 * suivant : l'ordre prevu ne bouge jamais, et ce qu'on a saute pour une machine
 * prise revient de lui-meme des que ce qu'on jouait a la place est termine.
 */
export function nextCursor(live: LiveSession, reps: number | null = null): Cursor {
  const { planIndex, setIndex } = live.cursor;
  if (live.mode === 'free') {
    if (reps !== 0) return { planIndex, setIndex: setIndex + 1 };
    const remaining = live.plan.findIndex((step, i) => i !== planIndex && !isAbandoned(live.entries, step));
    return remaining < 0 ? { planIndex: live.plan.length, setIndex: 1 } : groupCursor(live, remaining)!;
  }
  const step = live.plan[planIndex];
  if (!step) return { planIndex: planIndex + 1, setIndex: 1 };

  const updated = withCurrentDone(live, reps);
  const [first, last] = supersetRange(live.plan, planIndex);
  if (first === last) {
    if (reps !== 0 && setIndex < step.sets) return { planIndex, setIndex: setIndex + 1 };
    return resumeCursor(updated, 0);
  }

  const rounds = Math.max(...live.plan.slice(first, last + 1).map((s) => s.sets));
  for (let i = planIndex + 1, round = setIndex; round <= rounds; i += 1) {
    // Fin de la ronde : on repart du premier exercice de la paire, un tour plus loin.
    if (i > last) {
      i = first - 1;
      round += 1;
      continue;
    }
    if (!isAbandoned(updated.entries, live.plan[i]) && round <= live.plan[i].sets && !updated.entries.some((e) => entryMatchesStep(e, live.plan[i]) && e.setIndex === round)) return { planIndex: i, setIndex: round };
  }
  return resumeCursor(updated, 0);
}

/**
 * La seance telle qu'elle sera une fois la serie en cours validee. On demande le
 * curseur suivant *avant* d'ecrire au journal — et pour l'afficher, avant meme de
 * valider — : sans cela, le groupe qu'on termine passerait encore pour inacheve et
 * le curseur y resterait une serie de trop.
 */
function withCurrentDone(live: LiveSession, reps: number | null): LiveSession {
  const step = live.plan[live.cursor.planIndex];
  const pending: SetEntry = {
    itemId: step.id,
    exerciseId: step.exerciseId,
    exerciseName: step.exerciseName,
    setIndex: live.cursor.setIndex,
    reps,
    seconds: step.tracking === 'duration' && reps !== 0 ? reps : null,
    weight: null,
    rir: null,
  };
  return { ...live, entries: [...live.entries, pending] };
}

export const isFinished = (live: LiveSession) => live.mode !== 'free' && live.cursor.planIndex >= live.plan.length;

export function logSet(live: LiveSession, values: { reps: number; weight: number; rir: number | null }) {
  const step = live.plan[live.cursor.planIndex];
  const duration = step.tracking === 'duration';
  const entry: SetEntry = {
    itemId: step.id,
    exerciseId: step.exerciseId,
    exerciseName: step.exerciseName,
    setIndex: live.cursor.setIndex,
    reps: duration && values.reps !== 0 ? null : values.reps,
    seconds: duration && values.reps !== 0 ? values.reps : null,
    weight: duration ? null : values.weight,
    rir: duration ? null : values.rir,
  };
  // En séance libre, saisir un RIR clôt l'exercice : chaque série renseignée
  // ainsi est la dernière, et l'écran revient à la demande du prochain exercice.
  const cursor = live.mode === 'free' && values.reps !== 0 && (duration || values.rir !== null)
    ? { planIndex: live.plan.length, setIndex: 1 }
    : nextCursor(live, values.reps);
  dispatch('set.log', { entry, cursor });
}

export function moveTo(planIndex: number, setIndex = 1) {
  dispatch('session.cursor', { cursor: { planIndex, setIndex } });
}

/**
 * La machine est prise : on va jouer un autre exercice, choisi sur la carte de la seance.
 * On entre dans son groupe a la premiere serie non jouee ; un exercice fini ne s'ouvre
 * pas. Rien n'est reordonne : `nextCursor` ramenera sur ce qui reste, dans l'ordre prevu.
 */
export function jumpTo(live: LiveSession, planIndex: number) {
  const cursor = groupCursor(live, planIndex);
  if (cursor) dispatch('session.cursor', { cursor });
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
    tracking: existing?.tracking ?? 'reps',
    sets: known === null ? step.sets : Math.max(known, live.cursor.setIndex),
    carry: counter,
    notes: '',
  };
  dispatch('session.plan', { planIndex: live.cursor.planIndex, patch });
}

/**
 * La famille du programme d'ou vient la seance, pour pre-remplir ce qu'on y ajoute. Un
 * programme supprime en cours de route retombe sur l'hypertrophie, la famille du milieu.
 */
function sessionGoal(state: UserView, live: LiveSession): ProgramGoal {
  return (
    state.programs.find((p) => p.sessions.some((s) => s.id === live.sessionId))?.goal ??
    'hypertrophie'
  );
}

/**
 * Un exercice de plus, en fin de plan — pour cette seance seulement, le programme n'en sait
 * rien. L'ordre prevu ne bouge pas : il vient apres tout le reste, et l'on y va tout de
 * suite, comme `jumpTo` ; ce qu'on quitte reviendra de lui-meme. Un exercice deja joue
 * apporte son nombre de series et `advise` retrouvera sa charge ; un inconnu prend les
 * valeurs de la famille, et entre au catalogue pour etre propose la prochaine fois.
 */
export function appendStep(live: LiveSession, name: string) {
  const label = name.trim();
  if (!label) return;
  const state = getView();

  const existing = findExercise(state.exercises, label);
  const exerciseId = existing?.id ?? slug(label);
  if (!exerciseId) return;
  if (!existing) dispatch('exercise.upsert', { exercise: { id: exerciseId, name: label } });

  // En libre, sélectionner à nouveau le même exercice reprend ses séries.
  const prior = live.plan.findIndex((step) => step.exerciseId === exerciseId && !isAbandoned(live.entries, step));
  if (live.mode === 'free' && prior >= 0) {
    jumpTo(live, prior);
    return;
  }
  const item = blankItem(sessionGoal(state, live));
  const step: PlanStep = {
    ...item,
    exerciseId,
    exerciseName: existing?.name ?? label,
    tracking: existing?.tracking ?? 'reps',
    sets: live.mode === 'free' ? 0 : knownSets(state, exerciseId) ?? item.sets,
    ...(live.mode === 'free' ? {
      repMin: null, repMax: null, targetRirMin: null, targetRirMax: null,
    } : {}),
  };
  dispatch('session.append', { step, cursor: { planIndex: live.plan.length, setIndex: 1 } });
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

  if (step.tracking === 'duration') {
    const today = [...live.entries].reverse().find((e) => e.itemId === step.id && e.reps !== 0);
    const previous = historyOf(state, step.exerciseId).flatMap(({ entries }) => [...entries].reverse()).find((e) => e.reps !== 0);
    const seed = today ?? previous;
    return { weight: 0, reps: seed?.seconds ?? seed?.reps ?? 0, trend: 'hold', reason: '', from: 0 };
  }

  if (live.mode === 'free') {
    const today = [...live.entries].reverse().find((e) => e.itemId === step.id && e.reps !== 0);
    const previous = historyOf(state, step.exerciseId).flatMap(({ entries }) => [...entries].reverse()).find((e) => e.reps !== 0);
    const seed = today ?? previous;
    return { weight: seed?.weight ?? 0, reps: seed?.seconds ?? seed?.reps ?? 8,
      trend: 'hold', reason: '', from: seed?.weight ?? 0 };
  }
  const advice = advise(state, step, live.cursor.setIndex);
  if (advice) return advice;

  // Jamais fait : on reprend ce qui vient d'etre porte sur cet exercice aujourd'hui —
  // ou, s'il vient de remplacer un autre, ce que le compteur affichait a ce moment-la.
  const today = [...live.entries].reverse().find((e) => e.itemId === step.id && e.reps !== 0);
  const seed = today ?? step.carry ?? null;
  const seedValue = seed ? ('seconds' in seed ? seed.seconds ?? seed.reps : seed.reps) : null;
  return {
    weight: seed?.weight ?? 0,
    reps: seedValue ?? step.repMin ?? 8,
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
