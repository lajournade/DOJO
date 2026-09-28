import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  activeProgram,
  bestWeight,
  doneEntries,
  exerciseName,
  formatDate,
  historyOf,
  knownSets,
  lastRun,
  lastSet,
  recentLogs,
  sinceLabel,
  todayIso,
  tonnage,
  typicalMinutes,
} from './selectors';
import { etat, joueur, journal, programme, serie, vue } from '../test/fabrique';

const logs = [
  journal({ id: 'ancien', date: '2026-09-01', series: [serie('squat-barre', 1, 80, 8), serie('squat-barre', 2, 90, 8, 2)] }),
  journal({
    id: 'recent',
    date: '2026-09-11',
    startedAt: '2026-09-11T08:00:00.000Z',
    endedAt: '2026-09-11T08:45:00.000Z',
    series: [serie('squat-barre', 1, 60, 8), serie('squat-barre', 2, 100, 10, 2), serie('dips', 1, null, null)],
  }),
  journal({ id: 'b', date: '2026-09-11', sessionId: 'ses-b', startedAt: '2026-09-11T18:00:00.000Z', series: [serie('traction', 1, 0, 8)] }),
];
const s = vue(etat({ logs }));

describe('le programme et le catalogue', () => {
  it("activeProgram : celui du joueur, sinon le premier, sinon rien", () => {
    expect(activeProgram(s)?.code).toBe('P1');
    const autre = vue(etat({ programs: [programme(), programme({ id: 'prog-p2', code: 'P2' })], users: [joueur({ activeProgramId: 'prog-p2' })] }));
    expect(activeProgram(autre)?.code).toBe('P2');
    expect(activeProgram(vue(etat({ users: [joueur({ activeProgramId: 'perdu' })] })))?.code).toBe('P1');
    expect(activeProgram(vue(etat({ programs: [] })))).toBeNull();
  });

  it("exerciseName retombe sur l'identifiant", () => {
    expect(exerciseName(s, 'squat-barre')).toBe('Squat barre');
    expect(exerciseName(s, 'inconnu')).toBe('inconnu');
  });
});

describe('le journal', () => {
  it('tonnage et doneEntries ignorent les series vides', () => {
    expect(tonnage(logs[1].entries)).toBe(60 * 8 + 100 * 10);
    expect(doneEntries(logs[1].entries)).toHaveLength(2);
  });

  it('recentLogs trie par date puis par heure de depart, du plus recent au plus ancien', () => {
    expect(recentLogs(s).map((l) => l.id)).toEqual(['b', 'recent', 'ancien']);
  });

  it("historyOf ne garde que les seances ou l'exercice a ete joue", () => {
    expect(historyOf(s, 'squat-barre').map((r) => r.log.id)).toEqual(['recent', 'ancien']);
    expect(historyOf(s, 'dips')[0].entries).toHaveLength(1);
    expect(historyOf(s, 'inconnu')).toEqual([]);
  });

  it('lastSet trouve la serie exacte, sinon la derniere renseignee, sinon rien', () => {
    expect(lastSet(s, 'squat-barre', 1)?.weight).toBe(60);
    expect(lastSet(s, 'squat-barre', 3)?.weight).toBe(100);
    expect(lastSet(s, 'dips', 1)).toBeNull();
    expect(lastSet(s, 'inconnu', 1)).toBeNull();
  });

  it('knownSets et bestWeight', () => {
    expect(knownSets(s, 'squat-barre')).toBe(2);
    expect(knownSets(s, 'inconnu')).toBeNull();
    expect(bestWeight(s, 'squat-barre')).toBe(100);
    expect(bestWeight(s, 'dips')).toBe(0);
  });

  it('lastRun retrouve la derniere seance du programme', () => {
    expect(lastRun(s, 'ses-a')?.id).toBe('recent');
    expect(lastRun(s, 'ses-z')).toBeNull();
  });
});

describe('typicalMinutes', () => {
  const chrono = (id: string, minutes: number) =>
    journal({
      id,
      date: '2026-09-01',
      startedAt: '2026-09-01T08:00:00.000Z',
      endedAt: new Date(Date.parse('2026-09-01T08:00:00.000Z') + minutes * 60_000).toISOString(),
      series: [],
    });

  it('rend la mediane des durees, paire ou impaire', () => {
    expect(typicalMinutes(vue(etat({ logs: [chrono('a', 40), chrono('b', 50), chrono('c', 90)] })), 'ses-a')).toBe(50);
    expect(typicalMinutes(vue(etat({ logs: [chrono('a', 40), chrono('b', 50)] })), 'ses-a')).toBe(45);
  });

  it('ecarte les seances sans chrono, trop courtes ou oubliees ouvertes', () => {
    expect(typicalMinutes(s, 'ses-a')).toBe(45);
    expect(typicalMinutes(s, 'ses-b')).toBeNull();
    expect(typicalMinutes(vue(etat({ logs: [chrono('a', 3), chrono('b', 300)] })), 'ses-a')).toBeNull();
  });
});

describe('les dates', () => {
  afterEach(() => vi.useRealTimers());

  it('formatDate en francais court', () => {
    expect(formatDate('2026-09-18')).toMatch(/ven\.? 18 sept\.?/);
  });

  it("sinceLabel situe la seance, d'aujourd'hui aux mois", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 18, 21, 30));
    expect(sinceLabel('2026-09-18')).toBe("aujourd'hui");
    expect(sinceLabel('2026-09-17')).toBe('hier');
    expect(sinceLabel('2026-09-15')).toBe('il y a 3 j');
    expect(sinceLabel('2026-09-04')).toBe('il y a 2 sem.');
    expect(sinceLabel('2026-06-01')).toBe('il y a 3 mois');
    expect(todayIso()).toBe('2026-09-18');
  });
});

it('exclut les abandons des performances sans perdre les séries positives anciennes', () => {
  const entries = [serie('squat-barre', 1, 60, 8), serie('squat-barre', 2, 999, 0, 4), serie('squat-barre', 3, 70, 8)];
  const state = vue(etat({ logs: [journal({ date: '2026-09-18', series: entries })] }));
  expect(doneEntries(entries)).toHaveLength(2);
  expect(bestWeight(state, 'squat-barre')).toBe(70);
  expect(lastSet(state, 'squat-barre', 2)?.weight).toBe(70);
  expect(historyOf(state, 'squat-barre')[0].entries).toHaveLength(3);
  expect(doneEntries([serie('dips', 1, 0, 8), serie('dips', 2, 0, null)])).toHaveLength(1);
});
