/**
 * Fabriques d'etat pour les tests : des identifiants lisibles et stables, des
 * valeurs par defaut qui font un etat coherent, et trois historiques nommes qui
 * mettent la montee en charge dans chacun de ses cas.
 */
import type {
  AppState,
  Exercise,
  LiveSession,
  PlanStep,
  Program,
  ProgramItem,
  ProgramSession,
  SessionLog,
  SetEntry,
  User,
  UserView,
} from '../types';
import { slug } from '../store/programs';

export const serie = (
  exerciseId: string,
  setIndex: number,
  weight: number | null,
  reps: number | null,
  rir: number | null = null,
): SetEntry => ({
  exerciseId,
  exerciseName: NOMS[exerciseId] ?? exerciseId,
  setIndex,
  reps,
  weight,
  rir,
});

const NOMS: Record<string, string> = {
  'squat-barre': 'Squat barre',
  'developpe-couche': 'Développé couché',
  traction: 'Traction',
  'presse-a-cuisses': 'Presse à cuisses',
  'rowing-barre': 'Rowing barre',
  dips: 'Dips',
};

export const exercice = (nom: string): Exercise => ({ id: slug(nom), name: nom });

/** Le catalogue de base : les six exercices de `NOMS`, dans cet ordre. */
export const catalogue = (): Exercise[] => Object.values(NOMS).map(exercice);

let compteur = 0;

export function item(exerciseId: string, patch: Partial<ProgramItem> = {}): ProgramItem {
  compteur += 1;
  return {
    id: `it-${exerciseId}-${compteur}`,
    exerciseId,
    sets: 3,
    repMin: 8,
    repMax: 12,
    targetRirMin: 2,
    targetRirMax: 2,
    restSec: 90,
    notes: '',
    supersetGroup: null,
    ...patch,
  };
}

export const seance = (code: string, items: ProgramItem[], nom = `Séance ${code}`): ProgramSession => ({
  id: `ses-${code.toLowerCase()}`,
  code,
  name: nom,
  items,
});

export const programme = (patch: Partial<Program> = {}): Program => ({
  id: 'prog-p1',
  code: 'P1',
  name: 'Programme test',
  goal: 'hypertrophie',
  sessions: [
    seance('A', [item('squat-barre'), item('developpe-couche')]),
    seance('B', [item('traction'), item('presse-a-cuisses')]),
  ],
  ...patch,
});

export const joueur = (patch: Partial<User> = {}): User => ({
  id: 'u-1',
  name: 'Ludo',
  activeProgramId: 'prog-p1',
  palette: 0,
  ...patch,
});

export function journal(p: {
  date: string;
  series: SetEntry[];
  user?: string;
  programCode?: string;
  sessionId?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  id?: string;
}): SessionLog {
  return {
    id: p.id ?? `log-${p.date}-${p.user ?? 'u-1'}`,
    userId: p.user ?? 'u-1',
    programCode: p.programCode ?? 'P1-A',
    sessionId: p.sessionId === undefined ? 'ses-a' : p.sessionId,
    date: p.date,
    startedAt: p.startedAt ?? null,
    endedAt: p.endedAt ?? null,
    entries: p.series,
  };
}

/** Un etat deja migre : un joueur, un programme, le catalogue, aucun journal. */
export const etat = (patch: Partial<AppState> = {}): AppState => ({
  rev: 0,
  appliedOps: [],
  exercises: catalogue(),
  programs: [programme()],
  users: [joueur()],
  logs: [],
  liveSessions: {},
  ...patch,
});

export const etatDeBase = etat;

/** La meme projection que `state.ts` : ce que voient les ecrans d'un joueur. */
export function vue(e: AppState, userId = 'u-1'): UserView {
  const user = e.users.find((u) => u.id === userId) ?? { id: '', name: '', activeProgramId: null, palette: 0 };
  return {
    rev: e.rev,
    user,
    exercises: e.exercises,
    programs: e.programs,
    logs: e.logs.filter((l) => l.userId === userId),
    liveSession: e.liveSessions[userId] ?? null,
  };
}

/** Le plan tel que `buildPlan` le monte, pour les tests qui parlent directement a `advise`. */
export const etape = (i: ProgramItem): PlanStep => ({ ...i, exerciseName: NOMS[i.exerciseId] ?? i.exerciseId });

export function seanceEnCours(p: {
  plan: PlanStep[];
  entries?: SetEntry[];
  cursor?: { planIndex: number; setIndex: number };
  user?: string;
  sessionId?: string | null;
}): LiveSession {
  return {
    ...journal({ date: '2026-09-18', series: p.entries ?? [], user: p.user, sessionId: p.sessionId }),
    startedAt: '2026-09-18T08:00:00.000Z',
    plan: p.plan,
    cursor: p.cursor ?? { planIndex: 0, setIndex: 1 },
  };
}

/**
 * Une seance A jouee il y a une semaine ou tout invite a monter : le squat a
 * rempli sa fourchette (12 reps a RIR 2 → +2,5 kg), le developpe pas encore
 * (10 reps a RIR 2 → une rep de plus).
 */
export const historiqueMontee = (): SessionLog[] => [
  journal({
    date: '2026-09-11',
    startedAt: '2026-09-11T08:00:00.000Z',
    endedAt: '2026-09-11T08:50:00.000Z',
    series: [
      serie('squat-barre', 1, 60, 8),
      serie('squat-barre', 2, 80, 8),
      serie('squat-barre', 3, 100, 12, 2),
      serie('developpe-couche', 1, 50, 10),
      serie('developpe-couche', 2, 50, 10),
      serie('developpe-couche', 3, 50, 10, 2),
    ],
  }),
];

/** Trois seances de suite a 100 kg sur le squat, sans un rep de plus : un palier. */
export const historiquePalier = (): SessionLog[] =>
  ['2026-09-01', '2026-09-05', '2026-09-09'].map((date) =>
    journal({
      date,
      series: [
        serie('squat-barre', 1, 60, 8),
        serie('squat-barre', 2, 80, 8),
        serie('squat-barre', 3, 100, 8, 1),
        serie('developpe-couche', 1, 50, 10),
        serie('developpe-couche', 2, 50, 10),
        serie('developpe-couche', 3, 50, 10, 1),
      ],
    }),
  );

/**
 * Le squat a 100 kg × 8 a RIR 2 sous un programme d'hypertrophie : joue ensuite
 * en force (5 a 6 reps), la charge se transpose a 107,5 kg. Sans RIR, rien ne bouge.
 */
export const historiqueCycle = (avecRir = true): SessionLog[] => [
  journal({
    date: '2026-09-11',
    programCode: 'P1-A',
    series: [
      serie('squat-barre', 1, 60, 8),
      serie('squat-barre', 2, 80, 8),
      serie('squat-barre', 3, 100, 8, avecRir ? 2 : null),
    ],
  }),
];

/** Un programme de force ou le squat se joue a 5–6 repetitions (l'exemple du README). */
export const programmeForce = (): Program =>
  programme({
    id: 'prog-p2',
    code: 'P2',
    name: 'Force',
    goal: 'force',
    sessions: [
      seance('A', [
        item('squat-barre', { repMin: 5, repMax: 6, restSec: 180 }),
        item('developpe-couche', { repMin: 5, repMax: 6, restSec: 180 }),
      ]),
    ],
  });
