/** Modele partage avec le serveur (server/ops.mjs applique les memes transformations). */

export interface Exercise {
  id: string;
  name: string;
}

/** Un exercice tel que prescrit dans une seance du programme. */
export interface ProgramItem {
  id: string;
  exerciseId: string;
  sets: number;
  repMin: number | null;
  repMax: number | null;
  targetRirMin: number | null;
  targetRirMax: number | null;
  restSec: number;
  notes: string;
}

export interface ProgramSession {
  id: string;
  code: string;
  name: string;
  items: ProgramItem[];
}

export interface Program {
  id: string;
  code: string;
  name: string;
  active: boolean;
  sessions: ProgramSession[];
}

/** Une serie realisee. Le RIR n'est renseigne que sur la derniere serie d'un exercice. */
export interface SetEntry {
  itemId?: string;
  exerciseId: string;
  exerciseName: string;
  setIndex: number;
  reps: number | null;
  weight: number | null;
  rir: number | null;
}

/** Une seance terminee, l'equivalent d'un bloc de lignes de l'onglet Suivit 2. */
export interface SessionLog {
  id: string;
  programCode: string;
  sessionId: string | null;
  date: string;
  startedAt: string | null;
  endedAt: string | null;
  entries: SetEntry[];
}

/**
 * Le plan est fige au demarrage de la seance : editer le programme en cours de
 * route ne modifie pas le combat engage.
 */
export interface PlanStep extends ProgramItem {
  exerciseName: string;
}

export interface Cursor {
  planIndex: number;
  setIndex: number;
}

export interface LiveSession extends SessionLog {
  plan: PlanStep[];
  cursor: Cursor;
}

export interface AppState {
  rev: number;
  appliedOps: string[];
  exercises: Exercise[];
  programs: Program[];
  logs: SessionLog[];
  liveSession: LiveSession | null;
}

export type OpType =
  | 'session.start'
  | 'session.cursor'
  | 'session.plan'
  | 'set.log'
  | 'set.edit'
  | 'set.remove'
  | 'session.finish'
  | 'session.abort'
  | 'program.save'
  | 'program.remove'
  | 'exercise.upsert'
  | 'log.edit'
  | 'log.remove';

export interface Op {
  opId: string;
  type: OpType;
  payload: Record<string, unknown>;
}
