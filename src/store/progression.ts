/**
 * La montee en charge : ce que le dojo propose aujourd'hui a partir de la
 * derniere fois. C'est ici que le RIR saisi a chaque derniere serie est enfin
 * relu — sans lui, valider sans rien toucher reconduirait la meme charge
 * indefiniment.
 *
 * Double progression : on remplit d'abord la fourchette de repetitions, puis on
 * monte la charge et on repart en bas de fourchette. Jamais de baisse
 * automatique : sous la cible, on maintient, et decharger reste un geste manuel.
 */
import type { AppState, PlanStep, SetEntry } from '../types';
import { historyOf, lastSet } from './selectors';

/** Le pas du compteur de charge : la valeur proposee tombe toujours sur sa grille. */
export const STEP_KG = 2.5;

export type Trend = 'up' | 'reps' | 'hold';

export interface Advice {
  weight: number;
  reps: number;
  trend: Trend;
  /** Une phrase courte pour le bandeau, en Silkscreen (accents autorises). */
  reason: string;
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
 * Ce que vaut la serie `setIndex` aujourd'hui.
 *
 * Le verdict se calcule une fois pour l'exercice, puis ne s'applique qu'aux
 * series qui portaient deja le poids de travail : la rampe d'echauffement
 * (40 / 60 / 80) garde ses valeurs, seule la serie lourde monte.
 */
export function advise(state: AppState, step: PlanStep, setIndex: number): Advice | null {
  const previous = lastSet(state, step.exerciseId, setIndex);
  if (!previous || previous.weight === null || previous.weight === undefined) return null;

  const plain: Advice = {
    weight: previous.weight,
    reps: previous.reps ?? step.repMin ?? 8,
    trend: 'hold',
    reason: '',
  };

  const last = historyOf(state, step.exerciseId)[0];
  const ref = last ? referenceSet(last.entries) : null;
  // Pas de RIR renseigne, ou serie plus legere que le poids de travail : on reconduit.
  if (!ref || ref.reps === null || ref.weight !== previous.weight) return plain;

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
    };
  }

  return {
    weight: previous.weight,
    reps: Math.min(ref.reps + 1, repMax),
    trend: 'reps',
    reason: `${rirText}encore une rep avant la charge`,
  };
}

/** Le gain annonce sur le bandeau : « +2,5 kg » ou « +1 rep ». */
export function gainLabel(advice: Advice): string {
  if (advice.trend === 'up') return `+${String(STEP_KG).replace('.', ',')} kg`;
  if (advice.trend === 'reps') return '+1 rep';
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
export function plateau(state: AppState, step: PlanStep): Plateau | null {
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
