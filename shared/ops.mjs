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
import { entryMatchesStep, isAbandoned } from './entries.mjs';

const APPLIED_HISTORY = 400;

/** La date locale est capturée par le client : le rejeu hors ligne reste déterministe. */
export function latestTodayLog(logs, userId, date) {
  return logs.filter((log) => log.userId === userId && log.date === date)
    .sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''))[0];
}

const handlers = {
  'session.resume': (s, { userId, logId, date, resumedAt }) => {
    const log = latestTodayLog(s.logs, userId, date);
    if (s.liveSessions[userId] || !log || log.id !== logId || !log.plan?.length) return;
    const live = JSON.parse(JSON.stringify(log));
    live.endedAt = null;
    live.resumedAt = resumedAt;
    live.cursor = { planIndex: live.plan.length, setIndex: 1 };
    if (live.mode === 'free') {
      const planIndex = live.plan.findLastIndex((step) => !isAbandoned(live.entries, step));
      if (planIndex < 0) { s.liveSessions[userId] = live; return; }
      const step = live.plan[planIndex];
      live.cursor = { planIndex, setIndex: live.entries.filter((e) => e.itemId === step.id).length + 1 };
      s.liveSessions[userId] = live;
      return;
    }
    // Parcours des groupes en rondes, y compris les supersets de tailles inégales.
    outer: for (let first = 0; first < live.plan.length;) {
      let last = first;
      const group = live.plan[first].supersetGroup;
      while (group && last + 1 < live.plan.length && live.plan[last + 1].supersetGroup === group) last++;
      const rounds = Math.max(...live.plan.slice(first, last + 1).map((step) => step.sets));
      for (let round = 1; round <= rounds; round++) {
        for (let i = first; i <= last; i++) {
          if (!isAbandoned(live.entries, live.plan[i]) && round <= live.plan[i].sets && !live.entries.some((entry) => entryMatchesStep(entry, live.plan[i]) && entry.setIndex === round)) {
            live.cursor = { planIndex: i, setIndex: round };
            break outer;
          }
        }
      }
      first = last + 1;
    }
    s.liveSessions[userId] = live;
  },
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
    if (live.mode === 'free') {
      const step = live.plan.find((s) => s.id === entry.itemId);
      if (step) step.sets = live.entries.filter((e) => e.itemId === step.id && (e.reps ?? 0) > 0).length;
    }
    if (cursor) live.cursor = cursor;
  },

  /** Corrige une serie de la seance en cours. */
  'set.edit': (s, { userId, index, patch }) => {
    const entry = s.liveSessions[userId]?.entries[index];
    if (entry) Object.assign(entry, patch);
  },

  'set.remove': (s, { userId, index }) => {
    const live = s.liveSessions[userId];
    if (live) {
      const [entry] = live.entries.splice(index, 1);
      if (live.mode === 'free' && entry) {
        const step = live.plan.find((s) => s.id === entry.itemId);
        if (step) step.sets = live.entries.filter((e) => e.itemId === step.id && (e.reps ?? 0) > 0).length;
      }
    }
  },

  /** Cloture : la seance en cours rejoint le journal. */
  'session.finish': (s, { userId, endedAt }) => {
    const live = s.liveSessions[userId];
    if (!live) return;
    delete s.liveSessions[userId];
    if (!live.entries.length) return;
    const { cursor, resumedAt, ...log } = live;
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
