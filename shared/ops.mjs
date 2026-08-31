/**
 * Application des operations. Le client mute d'abord son etat local puis envoie
 * l'operation ; le serveur rejoue exactement la meme transformation.
 * Chaque operation porte un opId : rejouer une operation deja appliquee ne fait rien,
 * ce qui rend la file d'attente du client sure meme si le VPN coupe en plein envoi.
 */
const APPLIED_HISTORY = 400;

const handlers = {
  /** Demarre une seance : le client envoie l'instantane complet (plan fige au demarrage). */
  'session.start': (s, { session }) => {
    s.liveSession = session;
  },

  /** Deplace le curseur exercice/serie (saut d'exercice, retour en arriere). */
  'session.cursor': (s, { cursor }) => {
    if (s.liveSession) s.liveSession.cursor = cursor;
  },

  /** Ajuste un exercice de la seance en cours (serie supplementaire, par exemple). */
  'session.plan': (s, { planIndex, patch }) => {
    const step = s.liveSession?.plan[planIndex];
    if (step) Object.assign(step, patch);
  },

  /** Enregistre une serie realisee. */
  'set.log': (s, { entry, cursor }) => {
    if (!s.liveSession) return;
    s.liveSession.entries.push(entry);
    if (cursor) s.liveSession.cursor = cursor;
  },

  /** Corrige une serie de la seance en cours. */
  'set.edit': (s, { index, patch }) => {
    const entry = s.liveSession?.entries[index];
    if (entry) Object.assign(entry, patch);
  },

  'set.remove': (s, { index }) => {
    if (s.liveSession) s.liveSession.entries.splice(index, 1);
  },

  /** Cloture : la seance en cours rejoint le journal. */
  'session.finish': (s, { endedAt }) => {
    const live = s.liveSession;
    if (!live) return;
    s.liveSession = null;
    if (!live.entries.length) return;
    const { plan, cursor, ...log } = live;
    log.endedAt = endedAt;
    s.logs = s.logs.filter((l) => l.id !== log.id);
    s.logs.push(log);
    s.logs.sort((a, b) => a.date.localeCompare(b.date) || (a.startedAt ?? '').localeCompare(b.startedAt ?? ''));
  },

  'session.abort': (s) => {
    s.liveSession = null;
  },

  /** L'editeur envoie le programme entier : plus simple et sans risque de divergence. */
  'program.save': (s, { program }) => {
    const i = s.programs.findIndex((p) => p.id === program.id);
    if (i === -1) s.programs.push(program);
    else s.programs[i] = program;
  },

  'program.remove': (s, { programId }) => {
    s.programs = s.programs.filter((p) => p.id !== programId);
  },

  'exercise.upsert': (s, { exercise }) => {
    const i = s.exercises.findIndex((e) => e.id === exercise.id);
    if (i === -1) s.exercises.push(exercise);
    else s.exercises[i] = { ...s.exercises[i], ...exercise };
  },

  /** Correction d'une seance passee depuis l'historique. */
  'log.edit': (s, { logId, patch }) => {
    const log = s.logs.find((l) => l.id === logId);
    if (log) Object.assign(log, patch);
  },

  'log.remove': (s, { logId }) => {
    s.logs = s.logs.filter((l) => l.id !== logId);
  },
};

export function applyOp(state, op) {
  const handler = handlers[op.type];
  if (!handler) throw new Error(`operation inconnue : ${op.type}`);
  handler(state, op.payload ?? {});
}

/**
 * Applique une salve d'operations. Renvoie le nombre reellement applique
 * (les doublons sont ignores silencieusement).
 */
export function applyBatch(state, ops) {
  const seen = new Set(state.appliedOps);
  let applied = 0;
  for (const op of ops) {
    if (!op?.opId || seen.has(op.opId)) continue;
    applyOp(state, op);
    seen.add(op.opId);
    state.appliedOps.push(op.opId);
    state.rev += 1;
    applied += 1;
  }
  if (state.appliedOps.length > APPLIED_HISTORY) {
    state.appliedOps = state.appliedOps.slice(-APPLIED_HISTORY);
  }
  return applied;
}
