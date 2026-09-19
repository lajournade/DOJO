/**
 * Les trois familles de programme : leurs libelles, et ce qu'elles pre-remplissent.
 *
 * C'est le seul endroit ou la categorie agit. Elle ne pilote pas la montee en
 * charge : elle pose les fourchettes de repetitions, et ce sont elles que
 * `progression.ts` relit pour transposer les charges d'un cycle a l'autre.
 */
import type { Exercise, Program, ProgramGoal, ProgramItem } from '../types';

export interface GoalPreset {
  label: string;
  repMin: number;
  repMax: number;
  rir: number;
}

export const GOALS: Record<ProgramGoal, GoalPreset> = {
  force: { label: 'force', repMin: 3, repMax: 5, rir: 2 },
  hypertrophie: { label: 'hypertrophie', repMin: 8, repMax: 12, rir: 2 },
  endurance: { label: 'endurance', repMin: 15, repMax: 20, rir: 3 },
};

/** Du plus lourd au plus long : l'ordre des touches, et celui de la bibliotheque. */
export const GOAL_ORDER: ProgramGoal[] = ['force', 'hypertrophie', 'endurance'];

/** Identifiant lisible et stable derive du nom, aligne sur celui de l'import du classeur. */
export function slug(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

/**
 * L'exercice du catalogue qui porte ce nom, ou `null`. La comparaison passe par le
 * slug : ni la casse ni les accents ne font un exercice nouveau.
 */
export function findExercise(exercises: Exercise[], name: string): Exercise | null {
  const key = slug(name);
  if (!key) return null;
  return exercises.find((e) => e.id === key || slug(e.name) === key) ?? null;
}

const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** Un exercice neuf, aux valeurs de la famille. Elles restent modifiables ligne a ligne. */
export function blankItem(goal: ProgramGoal): ProgramItem {
  const preset = GOALS[goal];
  return {
    id: uid('it'),
    exerciseId: '',
    sets: 3,
    repMin: preset.repMin,
    repMax: preset.repMax,
    targetRirMin: preset.rir,
    targetRirMax: preset.rir,
    notes: '',
    supersetGroup: null,
  };
}

export function blankProgram(goal: ProgramGoal, code: string): Program {
  return { id: uid('prog'), code, name: 'Nouveau programme', goal, sessions: [] };
}

/**
 * Copie d'un programme.
 *
 * Les identifiants de seance sont regeneres : l'historique s'indexe par
 * `sessionId` (`lastRun`), et deux programmes qui en partageraient un
 * melangeraient leurs journaux.
 */
export function duplicateProgram(program: Program, code: string): Program {
  return {
    ...program,
    id: uid('prog'),
    code,
    name: `${program.name} (copie)`,
    sessions: program.sessions.map((session) => ({
      ...session,
      id: uid('ses'),
      items: session.items.map((item) => ({ ...item, id: uid('it') })),
    })),
  };
}

/** Le prochain code libre de la bibliotheque : P1, P2, P3... */
export function nextCode(programs: Program[]): string {
  for (let n = 1; n < 100; n += 1) {
    const code = `P${n}`;
    if (!programs.some((p) => p.code === code)) return code;
  }
  return `P${programs.length + 1}`;
}
