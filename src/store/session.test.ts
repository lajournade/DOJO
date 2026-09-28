import { describe, expect, it } from 'vitest';
import {
  buildPlan,
  doneSets,
  groupCursor,
  isFinished,
  nextCursor,
  previewSession,
  repRange,
  resumeCursor,
  rirTarget,
  stepStatus,
  suggestion,
  supersetRange,
  totalSets,
} from './session';
import {
  etape,
  etat,
  historiqueCycle,
  historiqueMontee,
  historiquePalier,
  item,
  journal,
  programme,
  programmeForce,
  seance,
  seanceEnCours,
  serie,
  vue,
} from '../test/fabrique';
import type { LiveSession, PlanStep } from '../types';

const s = vue(etat());
const sessionA = s.programs[0].sessions[0];

/** Une seance en cours ou `n` series de chaque pas sont deja au journal, dans l'ordre du plan. */
function jouee(plan: PlanStep[], faites: number[], cursor?: LiveSession['cursor']): LiveSession {
  const entries = plan.flatMap((step, i) =>
    Array.from({ length: faites[i] ?? 0 }, (_, k) => ({ ...serie(step.exerciseId, k + 1, 50, 8), itemId: step.id })),
  );
  return seanceEnCours({ plan, entries, cursor });
}

describe('buildPlan et totalSets', () => {
  it('fige le programme avec les noms du catalogue', () => {
    const plan = buildPlan(s, sessionA);
    expect(plan.map((p) => p.exerciseName)).toEqual(['Squat barre', 'Développé couché']);
    expect(totalSets(plan)).toBe(6);
  });
});

describe('previewSession — le briefing', () => {
  it("annonce « premiere fois » sans historique et estime la duree depuis le programme", () => {
    const p = previewSession(s, sessionA);
    expect(p.steps.every((st) => !st.known)).toBe(true);
    expect(p.sets).toBe(6);
    // 6 series × 120 s : 12 min.
    expect(p.minutes).toBe(12);
    expect(p.estimated).toBe(true);
    expect([p.ups, p.shifts, p.stuck]).toEqual([0, 0, 0]);
  });

  it('compte les montees et lit la rampe, et prefere la duree mesuree', () => {
    const p = previewSession(vue(etat({ logs: historiqueMontee() })), sessionA);
    expect(p.ups).toBe(2);
    expect(p.steps[0]).toMatchObject({ first: 60, work: 102.5, ramp: true, trend: 'up', gain: '+2,5 kg', known: true, plateau: null });
    expect(p.steps[1]).toMatchObject({ first: 50, work: 50, ramp: false, trend: 'reps', gain: '+1 rep' });
    expect(p.minutes).toBe(50);
    expect(p.estimated).toBe(false);
  });

  it('compte les paliers, seulement quand rien ne monte', () => {
    const p = previewSession(vue(etat({ logs: historiquePalier() })), sessionA);
    expect(p.stuck).toBe(2);
    expect(p.steps[0].plateau).toEqual({ sessions: 3, weight: 100 });
    expect(p.steps[0].gain).toBe('');
  });

  it('compte les transpositions', () => {
    const force = programmeForce();
    const p = previewSession(vue(etat({ programs: [programme(), force], logs: historiqueCycle() })), force.sessions[0]);
    expect(p.shifts).toBe(1);
    expect(p.steps[0]).toMatchObject({ first: 62.5, work: 107.5, trend: 'shift', gain: '+7,5 kg' });
    expect(p.steps[1].known).toBe(false);
  });

  it('retombe sur la derniere serie connue quand le plan en demande plus, et gere un plan vide', () => {
    const court = [journal({ date: '2026-09-11', series: [serie('squat-barre', 1, 100, 8, 2)] })];
    const plus = seance('A', [item('squat-barre', { sets: 4 })]);
    const p = previewSession(vue(etat({ logs: court })), plus);
    expect(p.steps[0]).toMatchObject({ known: true, work: 100 });
    expect(previewSession(s, seance('Z', [])).minutes).toBe(1);
  });
});

describe('supersetRange, doneSets, stepStatus', () => {
  const plan = [
    etape(item('squat-barre')),
    etape(item('traction', { supersetGroup: 'A' })),
    etape(item('dips', { supersetGroup: 'A' })),
    etape(item('presse-a-cuisses', { supersetGroup: 'B' })),
  ];

  it('borne le groupe aux voisins qui portent la meme lettre', () => {
    expect(supersetRange(plan, 0)).toEqual([0, 0]);
    expect(supersetRange(plan, 1)).toEqual([1, 2]);
    expect(supersetRange(plan, 2)).toEqual([1, 2]);
    expect(supersetRange(plan, 3)).toEqual([3, 3]);
    expect(supersetRange(plan, 9)).toEqual([9, 9]);
  });

  it('dit ou en est chaque pas', () => {
    const live = jouee(plan, [3, 1, 0, 0]);
    expect(doneSets(live, 0)).toBe(3);
    expect(stepStatus(live, 0)).toBe('done');
    expect(stepStatus(live, 1)).toBe('started');
    expect(stepStatus(live, 2)).toBe('todo');
  });
});

describe('groupCursor et resumeCursor', () => {
  const plan = [etape(item('squat-barre')), etape(item('traction', { supersetGroup: 'A', sets: 2 })), etape(item('dips', { supersetGroup: 'A' }))];

  it("entre a la premiere serie non jouee, en rondes dans un superset", () => {
    expect(groupCursor(jouee(plan, [0, 0, 0]), 0)).toEqual({ planIndex: 0, setIndex: 1 });
    expect(groupCursor(jouee(plan, [2, 0, 0]), 0)).toEqual({ planIndex: 0, setIndex: 3 });
    expect(groupCursor(jouee(plan, [3, 0, 0]), 0)).toBeNull();
    expect(groupCursor(jouee(plan, [0, 1, 0]), 2)).toEqual({ planIndex: 2, setIndex: 1 });
    expect(groupCursor(jouee(plan, [0, 1, 1]), 1)).toEqual({ planIndex: 1, setIndex: 2 });
    // La traction n'a que deux series : la troisieme ronde ne visite que les dips.
    expect(groupCursor(jouee(plan, [0, 2, 2]), 1)).toEqual({ planIndex: 2, setIndex: 3 });
  });

  it('reprend au premier groupe inacheve, ou sort du plan', () => {
    expect(resumeCursor(jouee(plan, [3, 0, 0]), 0)).toEqual({ planIndex: 1, setIndex: 1 });
    expect(resumeCursor(jouee(plan, [1, 2, 3]), 0)).toEqual({ planIndex: 0, setIndex: 2 });
    expect(resumeCursor(jouee(plan, [3, 2, 3]), 0)).toEqual({ planIndex: 3, setIndex: 1 });
    expect(resumeCursor(jouee(plan, [0, 0, 0]), 1)).toEqual({ planIndex: 1, setIndex: 1 });
  });
});

describe('nextCursor', () => {
  it('avance de serie en serie puis passe a l\'exercice suivant', () => {
    const plan = buildPlan(s, sessionA);
    expect(nextCursor(jouee(plan, [0, 0], { planIndex: 0, setIndex: 1 }))).toEqual({ planIndex: 0, setIndex: 2 });
    expect(nextCursor(jouee(plan, [2, 0], { planIndex: 0, setIndex: 3 }))).toEqual({ planIndex: 1, setIndex: 1 });
    expect(nextCursor(jouee(plan, [3, 2], { planIndex: 1, setIndex: 3 }))).toEqual({ planIndex: 2, setIndex: 1 });
  });

  it("revient sur le premier exercice non termine plutot que sur le suivant", () => {
    const plan = buildPlan(s, sessionA);
    // Le squat a ete saute (machine prise), le developpe se finit : retour au squat, serie 2.
    expect(nextCursor(jouee(plan, [1, 2], { planIndex: 1, setIndex: 3 }))).toEqual({ planIndex: 0, setIndex: 2 });
  });

  it('tourne dans un superset, en sautant le partenaire plus court', () => {
    const plan = [etape(item('traction', { supersetGroup: 'A', sets: 2 })), etape(item('dips', { supersetGroup: 'A' })), etape(item('squat-barre'))];
    expect(nextCursor(jouee(plan, [0, 0, 0], { planIndex: 0, setIndex: 1 }))).toEqual({ planIndex: 1, setIndex: 1 });
    expect(nextCursor(jouee(plan, [1, 0, 0], { planIndex: 1, setIndex: 1 }))).toEqual({ planIndex: 0, setIndex: 2 });
    expect(nextCursor(jouee(plan, [2, 1, 0], { planIndex: 1, setIndex: 2 }))).toEqual({ planIndex: 1, setIndex: 3 });
    expect(nextCursor(jouee(plan, [2, 2, 0], { planIndex: 1, setIndex: 3 }))).toEqual({ planIndex: 2, setIndex: 1 });
  });

  it('sort du plan derriere le dernier pas', () => {
    const plan = buildPlan(s, sessionA);
    const live = jouee(plan, [3, 3], { planIndex: 2, setIndex: 1 });
    expect(nextCursor(live)).toEqual({ planIndex: 3, setIndex: 1 });
    expect(isFinished(live)).toBe(true);
    expect(isFinished(jouee(plan, [0, 0]))).toBe(false);
  });
});

describe('suggestion — ce que le compteur affiche', () => {
  const plan = buildPlan(s, sessionA);

  it("suit advise quand il y a un historique", () => {
    const live = jouee(plan, [2, 0], { planIndex: 0, setIndex: 3 });
    expect(suggestion(vue(etat({ logs: historiqueMontee() })), live)).toMatchObject({ weight: 102.5, trend: 'up' });
  });

  it("repart de ce qui vient d'etre porte aujourd'hui, sinon du compteur herite, sinon du bas de fourchette", () => {
    expect(suggestion(s, jouee(plan, [1, 0], { planIndex: 0, setIndex: 2 }))).toMatchObject({ weight: 50, reps: 8, trend: 'hold' });
    const herite = jouee([{ ...plan[0], carry: { weight: 70, reps: 6 } }], [0]);
    expect(suggestion(s, herite)).toMatchObject({ weight: 70, reps: 6 });
    expect(suggestion(s, jouee(plan, [0, 0]))).toMatchObject({ weight: 0, reps: 8 });
    const libre = jouee([etape(item('dips', { repMin: null, repMax: null }))], [0]);
    expect(suggestion(s, libre)).toMatchObject({ weight: 0, reps: 8 });
  });

  it('rend un vide hors du plan', () => {
    expect(suggestion(s, jouee(plan, [3, 3], { planIndex: 2, setIndex: 1 }))).toMatchObject({ weight: 0, reps: 0 });
  });
});

describe('repRange et rirTarget', () => {
  it('formatent la fourchette et la cible', () => {
    expect(repRange(etape(item('x')))).toBe('8–12');
    expect(repRange(etape(item('x', { repMax: 8 })))).toBe('8');
    expect(repRange(etape(item('x', { repMin: null })))).toBe('—');
    expect(rirTarget(etape(item('x')))).toBe('2');
    expect(rirTarget(etape(item('x', { targetRirMax: 3 })))).toBe('2–3');
    expect(rirTarget(etape(item('x', { targetRirMin: null })))).toBeNull();
  });
});

describe('mode libre', () => {
  it('reste ouvert sans plan, avance sur le même exercice et autorise sa reprise', () => {
    const empty = { ...seanceEnCours({ plan: [] }), mode: 'free' as const };
    expect(isFinished(empty)).toBe(false);
    const live = { ...jouee([etape(item('dips', { sets: 1 }))], [1]), mode: 'free' as const };
    expect(nextCursor(live)).toEqual({ planIndex: 0, setIndex: 2 });
    expect(groupCursor(live, 0)).toEqual({ planIndex: 0, setIndex: 2 });
    expect(stepStatus(live, 0)).toBe('started');
  });

  it('préfère la dernière série du jour à l’historique, sans progression automatique', () => {
    const state = vue(etat({ logs: historiqueMontee() }));
    const live = { ...jouee([etape(item('squat-barre'))], [0]), mode: 'free' as const };
    expect(suggestion(state, live)).toMatchObject({ weight: 100, trend: 'hold' });
    live.entries = [{ ...serie('squat-barre', 1, 77.5, 7), itemId: live.plan[0].id }];
    expect(suggestion(state, live)).toMatchObject({ weight: 77.5, reps: 7, trend: 'hold' });
  });
});

it('ne prend pas la séance reprise comme référence de progression', () => {
  const plan = [etape(item('squat-barre', { sets: 3 }))];
  const live = jouee(plan, [1], { planIndex: 0, setIndex: 2 });
  live.resumedAt = '2026-09-18T12:00:00Z';
  const reference = { ...live, endedAt: '2026-09-18T11:00:00Z', entries: live.entries.map((e) => ({ ...e, weight: 200, rir: 4 })) };
  const state = vue(etat({ logs: [reference], liveSessions: { 'u-1': live } }));
  expect(suggestion(state, live).weight).toBe(50);
  expect(suggestion(state, live).trend).toBe('hold');
});

describe('abandon à zéro répétition', () => {
  const plan = [etape(item('squat-barre')), etape(item('dips'))];
  it('saute les séries restantes et distingue les séries réalisées', () => {
    const live = jouee(plan, [1, 0], { planIndex: 0, setIndex: 2 });
    expect(nextCursor(live, 0)).toEqual({ planIndex: 1, setIndex: 1 });
    live.entries.push({ ...serie('squat-barre', 2, 100, 0), itemId: plan[0].id });
    expect(stepStatus(live, 0)).toBe('abandoned');
    expect(doneSets(live, 0)).toBe(1);
    expect(groupCursor(live, 0)).toBeNull();
    expect(resumeCursor(live, 0)).toEqual({ planIndex: 1, setIndex: 1 });
  });
  it('poursuit le partenaire du superset sans revenir sur l’abandon', () => {
    const pair = plan.map((step) => ({ ...step, supersetGroup: 'A' }));
    const live = jouee(pair, [0, 0], { planIndex: 0, setIndex: 1 });
    expect(nextCursor(live, 0)).toEqual({ planIndex: 1, setIndex: 1 });
    live.entries.push({ ...serie('squat-barre', 1, 100, 0), itemId: pair[0].id });
    live.cursor = { planIndex: 1, setIndex: 1 };
    expect(nextCursor(live, 8)).toEqual({ planIndex: 1, setIndex: 2 });
    expect(nextCursor(live, 0).planIndex).toBe(2);
  });
  it('isole les occurrences et reconnaît les anciens zéros sans itemId', () => {
    const repeated = [plan[0], { ...plan[0], id: 'autre' }];
    const live = jouee(repeated, [0, 0]);
    live.entries.push({ ...serie('squat-barre', 1, 100, 0), itemId: plan[0].id });
    expect(stepStatus(live, 0)).toBe('abandoned');
    expect(stepStatus(live, 1)).toBe('todo');
    delete live.entries[0].itemId;
    expect(stepStatus(live, 1)).toBe('abandoned');
  });
  it('laisse la séance libre ouverte et termine une séance programmée', () => {
    const live = jouee([plan[0]], [0], { planIndex: 0, setIndex: 1 });
    expect(isFinished({ ...live, cursor: nextCursor(live, 0) })).toBe(true);
    live.mode = 'free';
    expect(nextCursor(live, 0)).toEqual({ planIndex: 1, setIndex: 1 });
    expect(isFinished({ ...live, cursor: nextCursor(live, 0) })).toBe(false);
  });
});
