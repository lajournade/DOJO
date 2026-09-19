import { describe, expect, it } from 'vitest';
import { applyBatch, applyOp } from './ops.mjs';
import type { AppState, Op, OpType } from '../src/types';
import { etat, etape, item, journal, programme, seanceEnCours, serie } from '../src/test/fabrique';

/** Une operation nommee par son type, avec un opId derive : lisible dans les listes. */
const op = (type: OpType, payload: Record<string, unknown>, opId = `${type}#${JSON.stringify(payload).length}`): Op => ({
  opId,
  type,
  payload,
});

function avecSeance(entries = 0): AppState {
  const plan = [etape(item('squat-barre')), etape(item('developpe-couche'))];
  const live = seanceEnCours({
    plan,
    entries: Array.from({ length: entries }, (_, i) => ({ ...serie('squat-barre', i + 1, 60, 8), itemId: plan[0].id })),
    cursor: { planIndex: 0, setIndex: entries + 1 },
  });
  return etat({ liveSessions: { 'u-1': live } });
}

describe('les operations de seance', () => {
  it('session.start pose la seance en cours du joueur, et remplace la precedente', () => {
    const s = etat();
    const live = seanceEnCours({ plan: [etape(item('squat-barre'))] });
    applyOp(s, op('session.start', { userId: 'u-1', session: live }));
    expect(s.liveSessions['u-1']).toBe(live);
    const autre = seanceEnCours({ plan: [], sessionId: 'ses-b' });
    applyOp(s, op('session.start', { userId: 'u-1', session: autre }));
    expect(s.liveSessions['u-1']).toBe(autre);
  });

  it('session.cursor deplace le curseur, et ne fait rien sans seance', () => {
    const s = avecSeance();
    applyOp(s, op('session.cursor', { userId: 'u-1', cursor: { planIndex: 1, setIndex: 2 } }));
    expect(s.liveSessions['u-1'].cursor).toEqual({ planIndex: 1, setIndex: 2 });
    applyOp(s, op('session.cursor', { userId: 'u-2', cursor: { planIndex: 0, setIndex: 1 } }));
    expect(s.liveSessions['u-2']).toBeUndefined();
  });

  it('session.plan retouche un pas du plan sans toucher les autres', () => {
    const s = avecSeance();
    applyOp(s, op('session.plan', { userId: 'u-1', planIndex: 1, patch: { sets: 5, notes: 'lent' } }));
    expect(s.liveSessions['u-1'].plan[1]).toMatchObject({ sets: 5, notes: 'lent', exerciseId: 'developpe-couche' });
    expect(s.liveSessions['u-1'].plan[0].sets).toBe(3);
    applyOp(s, op('session.plan', { userId: 'u-1', planIndex: 9, patch: { sets: 1 } }));
    expect(s.liveSessions['u-1'].plan).toHaveLength(2);
  });

  it('session.append ajoute un pas en fin de plan et y emmene le curseur', () => {
    const s = avecSeance();
    const step = etape(item('dips'));
    applyOp(s, op('session.append', { userId: 'u-1', step, cursor: { planIndex: 2, setIndex: 1 } }));
    expect(s.liveSessions['u-1'].plan[2]).toBe(step);
    expect(s.liveSessions['u-1'].cursor).toEqual({ planIndex: 2, setIndex: 1 });
    applyOp(s, op('session.append', { userId: 'u-1', step: etape(item('traction')) }));
    expect(s.liveSessions['u-1'].cursor).toEqual({ planIndex: 2, setIndex: 1 });
    applyOp(s, op('session.append', { userId: 'u-x', step }));
    expect(s.liveSessions['u-x']).toBeUndefined();
  });

  it("session.reorder, que plus rien n'emet, reste applicable pour les vieilles files", () => {
    const s = avecSeance();
    const [a, b] = s.liveSessions['u-1'].plan;
    applyOp(s, op('session.reorder', { userId: 'u-1', order: [1, 0], cursor: { planIndex: 0, setIndex: 1 } }));
    expect(s.liveSessions['u-1'].plan).toEqual([b, a]);
    applyOp(s, op('session.reorder', { userId: 'u-1', order: [1, 0] }));
    expect(s.liveSessions['u-1'].plan).toEqual([a, b]);
    applyOp(s, op('session.reorder', { userId: 'u-x', order: [] }));
  });

  it('set.log enregistre la serie et avance le curseur', () => {
    const s = avecSeance();
    const entry = serie('squat-barre', 1, 60, 8);
    applyOp(s, op('set.log', { userId: 'u-1', entry, cursor: { planIndex: 0, setIndex: 2 } }));
    expect(s.liveSessions['u-1'].entries).toEqual([entry]);
    expect(s.liveSessions['u-1'].cursor.setIndex).toBe(2);
    applyOp(s, op('set.log', { userId: 'u-1', entry }));
    expect(s.liveSessions['u-1'].entries).toHaveLength(2);
    applyOp(s, op('set.log', { userId: 'u-x', entry }));
  });

  it('set.edit corrige une serie, set.remove la retire', () => {
    const s = avecSeance(2);
    applyOp(s, op('set.edit', { userId: 'u-1', index: 1, patch: { reps: 6 } }));
    expect(s.liveSessions['u-1'].entries[1].reps).toBe(6);
    applyOp(s, op('set.edit', { userId: 'u-1', index: 5, patch: { reps: 6 } }));
    applyOp(s, op('set.remove', { userId: 'u-1', index: 0 }));
    expect(s.liveSessions['u-1'].entries.map((e) => e.reps)).toEqual([6]);
    applyOp(s, op('set.remove', { userId: 'u-x', index: 0 }));
  });

  it('session.finish verse la seance au journal, sans plan ni curseur, et trie', () => {
    const s = avecSeance(2);
    s.logs.push(journal({ date: '2026-09-20', series: [] }));
    applyOp(s, op('session.finish', { userId: 'u-1', endedAt: '2026-09-18T09:00:00.000Z' }));
    expect(s.liveSessions['u-1']).toBeUndefined();
    expect(s.logs.map((l) => l.date)).toEqual(['2026-09-18', '2026-09-20']);
    const log = s.logs[0] as unknown as Record<string, unknown>;
    expect(log.endedAt).toBe('2026-09-18T09:00:00.000Z');
    expect('plan' in log).toBe(false);
    expect('cursor' in log).toBe(false);
  });

  it('session.finish remplace un journal de meme identifiant, et ignore une seance vide', () => {
    const s = avecSeance(1);
    const id = s.liveSessions['u-1'].id;
    s.logs.push(journal({ id, date: '2026-09-18', series: [serie('dips', 1, 0, 5)] }));
    applyOp(s, op('session.finish', { userId: 'u-1', endedAt: 'x' }));
    expect(s.logs).toHaveLength(1);
    expect(s.logs[0].entries[0].exerciseId).toBe('squat-barre');

    const vide = avecSeance(0);
    applyOp(vide, op('session.finish', { userId: 'u-1', endedAt: 'x' }));
    expect(vide.logs).toEqual([]);
    expect(vide.liveSessions).toEqual({});
    applyOp(vide, op('session.finish', { userId: 'u-x', endedAt: 'x' }));
  });

  it('session.abort jette la seance en cours', () => {
    const s = avecSeance(2);
    applyOp(s, op('session.abort', { userId: 'u-1' }));
    expect(s.liveSessions).toEqual({});
    expect(s.logs).toEqual([]);
  });
});

describe('la bibliotheque, le catalogue et les joueurs', () => {
  it('program.save ajoute ou remplace un programme entier', () => {
    const s = etat();
    const p2 = programme({ id: 'prog-p2', code: 'P2' });
    applyOp(s, op('program.save', { program: p2 }));
    expect(s.programs.map((p) => p.code)).toEqual(['P1', 'P2']);
    applyOp(s, op('program.save', { program: { ...p2, name: 'Renomme' } }));
    expect(s.programs[1].name).toBe('Renomme');
    expect(s.programs).toHaveLength(2);
  });

  it('program.remove retire le programme et le lache de la main des joueurs', () => {
    const s = etat();
    applyOp(s, op('program.remove', { programId: 'prog-p1' }));
    expect(s.programs).toEqual([]);
    expect(s.users[0].activeProgramId).toBeNull();
  });

  it('exercise.upsert cree ou fusionne', () => {
    const s = etat({ exercises: [] });
    applyOp(s, op('exercise.upsert', { exercise: { id: 'dips', name: 'Dips' } }));
    applyOp(s, op('exercise.upsert', { exercise: { id: 'dips', name: 'Dips lestés' } }));
    expect(s.exercises).toEqual([{ id: 'dips', name: 'Dips lestés' }]);
  });

  it('user.upsert cree ou fusionne partiellement, user.remove emporte journal et seance', () => {
    const s = avecSeance(1);
    s.logs.push(journal({ date: '2026-09-01', series: [] }), journal({ date: '2026-09-02', user: 'u-2', series: [] }));
    applyOp(s, op('user.upsert', { user: { id: 'u-2', name: 'Lisa', activeProgramId: null, palette: 1 } }));
    applyOp(s, op('user.upsert', { user: { id: 'u-1', activeProgramId: 'prog-p9' } }));
    expect(s.users.map((u) => [u.name, u.activeProgramId])).toEqual([['Ludo', 'prog-p9'], ['Lisa', null]]);

    applyOp(s, op('user.remove', { userId: 'u-1' }));
    expect(s.users.map((u) => u.id)).toEqual(['u-2']);
    expect(s.logs.map((l) => l.userId)).toEqual(['u-2']);
    expect(s.liveSessions).toEqual({});
  });

  it('log.edit et log.remove touchent le journal', () => {
    const s = etat({ logs: [journal({ id: 'l1', date: '2026-09-01', series: [] }), journal({ id: 'l2', date: '2026-09-02', series: [] })] });
    applyOp(s, op('log.edit', { logId: 'l1', patch: { programCode: 'P9-Z' } }));
    applyOp(s, op('log.edit', { logId: 'zz', patch: { programCode: 'P9-Z' } }));
    expect(s.logs[0].programCode).toBe('P9-Z');
    applyOp(s, op('log.remove', { logId: 'l1' }));
    expect(s.logs.map((l) => l.id)).toEqual(['l2']);
  });

  it('refuse une operation inconnue', () => {
    expect(() => applyOp(etat(), { opId: 'x', type: 'boum' as OpType, payload: {} })).toThrow('operation inconnue : boum');
    // Sans payload, le handler recoit un objet vide plutot que de planter.
    const s = etat();
    applyOp(s, { opId: 'x', type: 'session.abort' } as Op);
    expect(s.liveSessions).toEqual({});
  });
});

describe('applyBatch', () => {
  it('applique chaque operation une fois, compte les appliquees, avance rev', () => {
    const s = etat();
    const ops = [
      op('exercise.upsert', { exercise: { id: 'dips', name: 'Dips' } }, 'a'),
      op('exercise.upsert', { exercise: { id: 'dips', name: 'Dips' } }, 'a'),
      op('log.remove', { logId: 'rien' }, 'b'),
      { type: 'log.remove', payload: {} } as Op,
    ];
    expect(applyBatch(s, ops)).toBe(2);
    expect(s.rev).toBe(2);
    expect(s.appliedOps).toEqual(['a', 'b']);
    // La meme salve rejouee ne fait rien : c'est ce qui rend la file du client sure.
    expect(applyBatch(s, ops)).toBe(0);
    expect(s.rev).toBe(2);
  });

  it("borne l'historique des identifiants a 400", () => {
    const s = etat();
    const ops = Array.from({ length: 450 }, (_, i) => op('log.remove', { logId: 'x' }, `op-${i}`));
    expect(applyBatch(s, ops)).toBe(450);
    expect(s.appliedOps).toHaveLength(400);
    expect(s.appliedOps[0]).toBe('op-50');
    expect(s.rev).toBe(450);
  });

  it("une operation inconnue interrompt la salve apres celles deja appliquees", () => {
    const s = etat({ exercises: [] });
    const ops = [
      op('exercise.upsert', { exercise: { id: 'dips', name: 'Dips' } }, 'a'),
      { opId: 'b', type: 'boum', payload: {} } as unknown as Op,
      op('exercise.upsert', { exercise: { id: 'tr', name: 'Tr' } }, 'c'),
    ];
    expect(() => applyBatch(s, ops)).toThrow();
    expect(s.exercises.map((e) => e.id)).toEqual(['dips']);
    expect(s.appliedOps).toEqual(['a']);
  });
});
