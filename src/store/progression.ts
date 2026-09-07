/**
 * La montee en charge : ce que le dojo propose aujourd'hui a partir de la
 * derniere fois. C'est ici que le RIR saisi a chaque derniere serie est enfin
 * relu — sans lui, valider sans rien toucher reconduirait la meme charge
 * indefiniment.
 *
 * Double progression : on remplit d'abord la fourchette de repetitions, puis on
 * monte la charge et on repart en bas de fourchette. Jamais de baisse
 * automatique : sous la cible, on maintient, et decharger reste un geste manuel.
 *
 * Un cas echappe a cette mecanique : le changement de fourchette. Passer d'un
 * cycle d'hypertrophie a un cycle de force ne se joue pas d'une seance sur
 * l'autre — la charge d'un travail a huit repetitions ne vaut rien pour cinq.
 * `transpose` la reporte alors par le 1RM estime, une fois, et la double
 * progression reprend la main des la seance suivante.
 */
import type { PlanStep, SetEntry, UserView } from '../types';
import { historyOf, lastSet } from './selectors';

/** Le pas du compteur de charge : la valeur proposee tombe toujours sur sa grille. */
export const STEP_KG = 2.5;

/** `shift` : la fourchette a change, la charge est transposee — elle peut descendre. */
export type Trend = 'up' | 'reps' | 'hold' | 'shift';

export interface Advice {
  weight: number;
  reps: number;
  trend: Trend;
  /** Une phrase courte pour le bandeau, en Silkscreen (accents autorises). */
  reason: string;
  /** La charge d'avant : c'est sur elle que se mesure l'ecart annonce. */
  from: number;
}

/**
 * La serie lourde de la derniere seance : la derniere a porter un RIR.
 * C'est elle qui porte le verdict, pas l'echauffement qui la precede.
 */
function referenceSet(entries: SetEntry[]): SetEntry | null {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i];
    if (entry.rir !== null && entry.rir !== undefined && entry.weight !== null) return entry;
  }
  return null;
}

/**
 * Au-dela d'une douzaine de repetitions a l'echec, Epley extrapole plus qu'elle
 * n'estime : on prefere ne rien proposer plutot que de proposer n'importe quoi.
 */
const MAX_EFFORT_REPS = 12;

/** Le 1RM estime (Epley). Le RIR dit ce qu'il restait : reps + rir = reps a l'echec. */
const oneRepMax = (weight: number, effortReps: number) => weight * (1 + effortReps / 30);

/** La charge, sur la grille du compteur, toujours arrondie en dessous de l'estimation. */
const onGrid = (weight: number) => Math.max(0, Math.floor(weight / STEP_KG) * STEP_KG);

/**
 * Le passage d'une fourchette a l'autre.
 *
 * Quand la derniere seance a ete jouee hors du `[repMin, repMax]` prescrit, c'est
 * que le programme a change de famille. La charge se reporte alors par le 1RM
 * estime : 100 kg x 8 a RIR 2 valent un 1RM de 133 kg, donc 107,5 kg pour 5
 * repetitions a RIR 2. Comme le reste du module, le verdict se calcule sur la
 * serie de travail puis s'applique aux autres par le meme rapport — la rampe
 * d'echauffement garde sa forme au lieu qu'une serie lourde saute seule.
 *
 * Renvoie `null` des qu'un element manque : sans RIR, sans fourchette, ou dans la
 * fourchette, il n'y a rien a transposer et la double progression parle.
 */
function transpose(step: PlanStep, ref: SetEntry, previousWeight: number): Advice | null {
  const repMin = step.repMin;
  const repMax = step.repMax ?? repMin;
  if (repMin === null || repMax === null) return null;
  if (ref.reps === null || ref.weight === null || ref.weight <= 0) return null;
  if (ref.rir === null || ref.rir === undefined) return null;

  // Toujours dans la fourchette prescrite : rien n'a change de famille.
  if (ref.reps >= repMin && ref.reps <= repMax) return null;

  const effort = ref.reps + ref.rir;
  if (effort < 1 || effort > MAX_EFFORT_REPS) return null;

  // On vise le bas de la nouvelle fourchette, a la reserve demandee : c'est de la
  // que la double progression repartira des la prochaine seance.
  const estimated = oneRepMax(ref.weight, effort);
  const work = onGrid(estimated / (1 + (repMin + (step.targetRirMin ?? 0)) / 30));
  if (work <= 0) return null;

  const weight = onGrid((previousWeight * work) / ref.weight);
  if (weight === previousWeight) return null;

  return {
    weight,
    reps: repMin,
    trend: 'shift',
    reason: `${ref.reps} reps → ${repMin} · 1rm est. ${Math.round(estimated)} kg`,
    from: previousWeight,
  };
}

/**
 * Ce que vaut la serie `setIndex` aujourd'hui.
 *
 * Le verdict se calcule une fois pour l'exercice, puis ne s'applique qu'aux
 * series qui portaient deja le poids de travail : la rampe d'echauffement
 * (40 / 60 / 80) garde ses valeurs, seule la serie lourde monte. Seule exception,
 * la transposition : changer de fourchette deplace l'exercice entier, rampe
 * comprise, sans quoi l'echauffement d'un cycle servirait dans l'autre.
 */
export function advise(state: UserView, step: PlanStep, setIndex: number): Advice | null {
  const previous = lastSet(state, step.exerciseId, setIndex);
  if (!previous || previous.weight === null || previous.weight === undefined) return null;

  const plain: Advice = {
    weight: previous.weight,
    reps: previous.reps ?? step.repMin ?? 8,
    trend: 'hold',
    reason: '',
    from: previous.weight,
  };

  const last = historyOf(state, step.exerciseId)[0];
  const ref = last ? referenceSet(last.entries) : null;
  if (!ref || ref.reps === null) return plain;

  // La fourchette a change : la charge se transpose au lieu de se reconduire, et
  // toutes les series suivent — l'echauffement comme la serie de travail.
  const shifted = transpose(step, ref, previous.weight);
  if (shifted) return shifted;

  // Serie plus legere que le poids de travail : on reconduit.
  if (ref.weight !== previous.weight) return plain;

  // Sous la cible de RIR, on maintient — et sans rien annoncer : le silence est
  // le cas courant, et une seance difficile n'a pas besoin d'etre commentee.
  if (step.targetRirMin !== null && (ref.rir ?? 0) < step.targetRirMin) return plain;

  // Cible de RIR absente : la progression se joue alors aux seules repetitions.
  const rirText = step.targetRirMin === null ? '' : `rir ${ref.rir} ≥ cible ${step.targetRirMin} · `;

  const repMin = step.repMin;
  const repMax = step.repMax ?? repMin;
  if (repMin === null || repMax === null) return plain;

  if (ref.reps >= repMax) {
    return {
      weight: previous.weight + STEP_KG,
      reps: repMin,
      trend: 'up',
      reason: `${rirText}${ref.reps} reps atteintes`,
      from: previous.weight,
    };
  }

  return {
    weight: previous.weight,
    reps: Math.min(ref.reps + 1, repMax),
    trend: 'reps',
    reason: `${rirText}encore une rep avant la charge`,
    from: previous.weight,
  };
}

/** Le gain annonce sur le bandeau : « +2,5 kg », « +1 rep », ou l'ecart d'une transposition. */
export function gainLabel(advice: Advice): string {
  if (advice.trend === 'up') return `+${String(STEP_KG).replace('.', ',')} kg`;
  if (advice.trend === 'reps') return '+1 rep';
  if (advice.trend === 'shift') {
    const delta = advice.weight - advice.from;
    return `${delta > 0 ? '+' : '−'}${Math.abs(delta).toLocaleString('fr-FR')} kg`;
  }
  return '';
}

/**
 * Le palier : trois seances a la meme charge, sans un rep de plus.
 *
 * `advise` maintient la charge quand le RIR passe sous la cible — c'est voulu, mais
 * repete, cela devient un pietinement que rien ne signale. On le compte donc, sans
 * rien y changer : constater est le role de ce module, decharger reste un geste.
 */
export const PLATEAU_SESSIONS = 3;

export interface Plateau {
  /** Nombre de seances consecutives a la meme charge. */
  sessions: number;
  /** La charge qui ne bouge plus : celle de la serie de travail. */
  weight: number;
}

/**
 * Le palier d'un exercice, ou `null` s'il avance encore.
 *
 * On ne lit que les series de travail — celles qui portent un RIR, comme le verdict.
 * Une seance ou le RIR a ete oublie n'en dit rien, ni dans un sens ni dans l'autre :
 * `referenceSet` l'ecarte, et elle ne rompt donc pas la serie.
 */
export function plateau(state: UserView, step: PlanStep): Plateau | null {
  const refs = historyOf(state, step.exerciseId)
    .map((row) => referenceSet(row.entries))
    .filter((e): e is SetEntry => e !== null && e.weight !== null);

  if (refs.length < PLATEAU_SESSIONS) return null;

  // De la plus recente vers l'ancienne, tant que la charge est la meme.
  const top = refs[0];
  let sessions = 1;
  while (sessions < refs.length && refs[sessions].weight === top.weight) sessions += 1;
  if (sessions < PLATEAU_SESSIONS) return null;

  // Les repetitions ont progresse a charge egale : c'est une montee, pas un palier.
  if ((top.reps ?? 0) > (refs[sessions - 1].reps ?? 0)) return null;

  return { sessions, weight: top.weight as number };
}

/** La sortie de palier proposee : un cran du compteur en moins, jamais sous zero. */
export const deloadWeight = (weight: number) => Math.max(0, weight - STEP_KG);
