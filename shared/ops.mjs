/**
 * Application des operations. Le client mute d'abord son etat local puis envoie
 * l'operation ; le serveur rejoue exactement la meme transformation.
 * Chaque operation porte un opId : rejouer une operation deja appliquee ne fait rien,
 * ce qui rend la file d'attente du client sure meme si le VPN coupe en plein envoi.
 *
 * Toutes les operations de seance portent un `userId` — `dispatch` l'ajoute — et ne
 * touchent que le sous-arbre de ce joueur : deux seances peuvent se mener en
 * parallele sans jamais se marcher dessus.
 */
const APPLIED_HISTORY = 400;

const handlers = {
  /** Demarre une seance : le client envoie l'instantane complet (plan fige au demarrage). */
  'session.start': (s, { userId, session }) => {
    s.liveSessions[userId] = session;
  },

  /** Deplace le curseur exercice/serie (saut d'exercice, retour en arriere). */
  'session.cursor': (s, { userId, cursor }) => {
    const live = s.liveSessions[userId];
    if (live) live.cursor = cursor;
  },

  /** Ajuste un exercice de la seance en cours (serie supplementaire, par exemple). */
  'session.plan': (s, { userId, planIndex, patch }) => {
    const step = s.liveSessions[userId]?.plan[planIndex];
    if (step) Object.assign(step, patch);
  },

  /**
   * Un exercice de plus en fin de plan, pour cette seance seulement — le programme n'en
   * sait rien. Le curseur voyage dans la meme operation : l'arene y va tout de suite.
   */
  'session.append': (s, { userId, step, cursor }) => {
    const live = s.liveSessions[userId];
    if (!live) return;
    live.plan.push(step);
    if (cursor) live.cursor = cursor;
  },

  /**
   * Reordonne le plan de la seance en cours. `order` est une permutation des index du
   * plan ; le curseur voyage dans la meme operation, pour ne jamais pointer un plan
   * qu'il ne decrit plus. Plus rien ne l'emet — l'arene ne reporte plus d'exercice, on
   * saute vers un autre par la carte — mais une file d'attente d'avant peut encore en
   * porter un, et une operation inconnue ferait echouer toute la salve.
   */
  'session.reorder': (s, { userId, order, cursor }) => {
    const live = s.liveSessions[userId];
    if (!live) return;
    live.plan = order.map((i) => live.plan[i]);
    if (cursor) live.cursor = cursor;
  },

  /** Enregistre une serie realisee. */
  'set.log': (s, { userId, entry, cursor }) => {
    const live = s.liveSessions[userId];
    if (!live) return;
    live.entries.push(entry);
    if (cursor) live.cursor = cursor;
  },

  /** Corrige une serie de la seance en cours. */
  'set.edit': (s, { userId, index, patch }) => {
    const entry = s.liveSessions[userId]?.entries[index];
    if (entry) Object.assign(entry, patch);
  },

  'set.remove': (s, { userId, index }) => {
    const live = s.liveSessions[userId];
    if (live) live.entries.splice(index, 1);
  },

  /** Cloture : la seance en cours rejoint le journal. */
  'session.finish': (s, { userId, endedAt }) => {
    const live = s.liveSessions[userId];
    if (!live) return;
    delete s.liveSessions[userId];
    if (!live.entries.length) return;
    const { plan, cursor, ...log } = live;
    log.endedAt = endedAt;
    s.logs = s.logs.filter((l) => l.id !== log.id);
    s.logs.push(log);
    s.logs.sort((a, b) => a.date.localeCompare(b.date) || (a.startedAt ?? '').localeCompare(b.startedAt ?? ''));
  },

  'session.abort': (s, { userId }) => {
    delete s.liveSessions[userId];
  },

  /** L'editeur envoie le programme entier : plus simple et sans risque de divergence. */
  'program.save': (s, { program }) => {
    const i = s.programs.findIndex((p) => p.id === program.id);
    if (i === -1) s.programs.push(program);
    else s.programs[i] = program;
  },

  /** Le programme disparait de la bibliotheque, et de la main de ceux qui le suivaient. */
  'program.remove': (s, { programId }) => {
    s.programs = s.programs.filter((p) => p.id !== programId);
    for (const user of s.users) {
      if (user.activeProgramId === programId) user.activeProgramId = null;
    }
  },

  'exercise.upsert': (s, { exercise }) => {
    const i = s.exercises.findIndex((e) => e.id === exercise.id);
    if (i === -1) s.exercises.push(exercise);
    else s.exercises[i] = { ...s.exercises[i], ...exercise };
  },

  /** Fusion partielle : cree un joueur, le renomme, ou lui change de programme en cours. */
  'user.upsert': (s, { user }) => {
    const i = s.users.findIndex((u) => u.id === user.id);
    if (i === -1) s.users.push(user);
    else s.users[i] = { ...s.users[i], ...user };
  },

  /** Le joueur s'en va avec tout ce qui lui appartient : son journal et sa seance en cours. */
  'user.remove': (s, { userId }) => {
    s.users = s.users.filter((u) => u.id !== userId);
    s.logs = s.logs.filter((l) => l.userId !== userId);
    delete s.liveSessions[userId];
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
