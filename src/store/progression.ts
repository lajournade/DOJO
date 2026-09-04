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
