/** Modele partage avec le serveur (shared/ops.mjs applique les memes transformations). */

export interface Exercise {
  id: string;
  name: string;
}

/**
 * Les trois familles de programme. La categorie ne pilote rien directement : elle
 * pre-remplit les fourchettes de repetitions, et ce sont elles qui commandent la
 * transposition des charges d'un cycle a l'autre (voir store/progression.ts).
 */
export type ProgramGoal = 'force' | 'hypertrophie' | 'endurance';

/** Un exercice tel que prescrit dans une seance du programme. */
export interface ProgramItem {
  id: string;
  exerciseId: string;
  sets: number;
  repMin: number | null;
  repMax: number | null;
  targetRirMin: number | null;
  targetRirMax: number | null;
  notes: string;
  /**
   * Les items consecutifs qui partagent cette lettre s'enchainent en superset :
   * l'arene alterne leurs series au lieu de les jouer bloc par bloc. Absent ou
   * `null` sur un exercice qui se joue seul.
   */
  supersetGroup?: string | null;
}

export interface ProgramSession {
  id: string;
  code: string;
  name: string;
  items: ProgramItem[];
}

/**
 * Un programme de la bibliotheque. Elle est commune a tous les joueurs : deux
 * personnes suivent le meme programme avec des charges et un journal separes.
 * Le programme en cours n'est donc pas une propriete du programme, mais du joueur.
 */
export interface Program {
  id: string;
  code: string;
  name: string;
  goal: ProgramGoal;
  sessions: ProgramSession[];
}

/**
 * Un joueur. Sans compte ni mot de passe : le profil se choisit a l'ouverture et
 * l'appareil s'en souvient — l'application vit sur un reseau prive.
 */
export interface User {
  id: string;
  name: string;
  /** Le programme en cours, propre a chaque joueur. */
  activeProgramId: string | null;
  /** Rang de couleur du costume, passe a `costume`. */
  palette: number;
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
  /** Absent sur les anciennes séances programmées. */
  mode?: 'program' | 'free';
  id: string;
  userId: string;
  programCode: string;
  sessionId: string | null;
  date: string;
  startedAt: string | null;
  endedAt: string | null;
  entries: SetEntry[];
  /** Instantané conservé pour reprendre les nouvelles séances. */
  plan?: PlanStep[];
}

/**
 * Le plan est fige au demarrage de la seance : editer le programme en cours de
 * route ne modifie pas le combat engage.
 */
export interface PlanStep extends ProgramItem {
  exerciseName: string;
  /**
   * Ce que le compteur affichait quand l'exercice a ete remplace par un inconnu :
   * sans historique, c'est de la que repart la suggestion. Absent sinon.
   */
  carry?: { weight: number; reps: number } | null;
}

export interface Cursor {
  planIndex: number;
  setIndex: number;
}

export interface LiveSession extends SessionLog {
  /** Identifie une réouverture et impose une clôture explicite. */
  resumedAt?: string;
  plan: PlanStep[];
  cursor: Cursor;
}

/** L'etat tel que le serveur le stocke : tous les joueurs, tous les journaux. */
export interface AppState {
  rev: number;
  appliedOps: string[];
  exercises: Exercise[];
  programs: Program[];
  users: User[];
  logs: SessionLog[];
  /** Une seance en cours par joueur : deux combats peuvent se mener en parallele. */
  liveSessions: Record<string, LiveSession>;
}

/**
 * Ce que voient les ecrans : l'etat ramene a un seul joueur. Les selecteurs et la
 * montee en charge ne lisent que cela, donc l'historique de l'un n'entre jamais
 * dans les suggestions de l'autre.
 */
export interface UserView {
  rev: number;
  user: User;
  exercises: Exercise[];
  /** La bibliotheque entiere : l'editeur de programmes en a besoin. */
  programs: Program[];
  /** Les seances du joueur courant, uniquement. */
  logs: SessionLog[];
  liveSession: LiveSession | null;
}

export type OpType =
  | 'session.start'
  | 'session.resume'
  | 'session.cursor'
  | 'session.plan'
  | 'session.append'
  | 'session.reorder'
  | 'set.log'
  | 'set.edit'
  | 'set.remove'
  | 'session.finish'
  | 'session.abort'
  | 'program.save'
  | 'program.remove'
  | 'exercise.upsert'
  | 'user.upsert'
  | 'user.remove'
  | 'log.edit'
  | 'log.remove';

export interface Op {
  opId: string;
  type: OpType;
  payload: Record<string, unknown>;
}
