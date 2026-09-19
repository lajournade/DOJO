import { describe, expect, it } from 'vitest';
import { advise, deloadWeight, gainLabel, plateau, type Advice } from './progression';
import {
  etape,
  etat,
  historiqueCycle,
  historiqueMontee,
  historiquePalier,
  item,
  journal,
  serie,
  vue,
} from '../test/fabrique';
import type { SessionLog } from '../types';

const squat = etape(item('squat-barre'));
const dev = etape(item('developpe-couche'));
const avec = (logs: SessionLog[]) => vue(etat({ logs }));

describe('advise — la double progression', () => {
  it("ne propose rien pour un exercice jamais pratique", () => {
    expect(advise(avec([]), squat, 1)).toBeNull();
  });

  it('monte de 2,5 kg quand le haut de fourchette est atteint a la reserve demandee', () => {
    const a = advise(avec(historiqueMontee()), squat, 3);
    expect(a).toMatchObject({ weight: 102.5, reps: 8, trend: 'up', from: 100 });
    expect(a?.reason).toBe('rir 2 ≥ cible 2 · 12 reps atteintes');
  });

  it("laisse l'echauffement a ses valeurs : seule la serie de travail monte", () => {
    const s = avec(historiqueMontee());
    expect(advise(s, squat, 1)).toMatchObject({ weight: 60, reps: 8, trend: 'hold', reason: '' });
    expect(advise(s, squat, 2)).toMatchObject({ weight: 80, reps: 8, trend: 'hold' });
  });

  it('ajoute une repetition tant que la fourchette n\'est pas remplie, plafonnee au maximum', () => {
    const s = avec(historiqueMontee());
    expect(advise(s, dev, 3)).toMatchObject({ weight: 50, reps: 11, trend: 'reps' });
    expect(advise(s, dev, 3)?.reason).toBe('rir 2 ≥ cible 2 · encore une rep avant la charge');
    const presque = avec([journal({ date: '2026-09-11', series: [serie('developpe-couche', 1, 50, 11, 2)] })]);
    expect(advise(presque, dev, 1)).toMatchObject({ reps: 12, trend: 'reps' });
  });

  it('maintient sans commentaire quand le RIR est sous la cible', () => {
    const s = avec([journal({ date: '2026-09-11', series: [serie('squat-barre', 1, 100, 12, 1)] })]);
    expect(advise(s, squat, 1)).toMatchObject({ weight: 100, reps: 12, trend: 'hold', reason: '' });
  });

  it("sans cible de RIR, la progression se joue aux seules repetitions", () => {
    const libre = etape(item('squat-barre', { targetRirMin: null, targetRirMax: null }));
    const s = avec([journal({ date: '2026-09-11', series: [serie('squat-barre', 1, 100, 12, 0)] })]);
    const a = advise(s, libre, 1);
    expect(a).toMatchObject({ weight: 102.5, trend: 'up' });
    expect(a?.reason).toBe('12 reps atteintes');
  });

  it('reconduit tel quel sans fourchette, ou sans RIR dans la derniere seance', () => {
    const sansFourchette = etape(item('squat-barre', { repMin: null, repMax: null }));
    const s = avec([journal({ date: '2026-09-11', series: [serie('squat-barre', 1, 100, 12, 2)] })]);
    expect(advise(s, sansFourchette, 1)).toMatchObject({ weight: 100, reps: 12, trend: 'hold' });
    expect(advise(avec(historiqueCycle(false)), squat, 3)).toMatchObject({ weight: 100, trend: 'hold' });
    // Une serie sans reps renseignees : rien a lire, on reconduit la charge et le bas de fourchette.
    const vide = avec([journal({ date: '2026-09-11', series: [serie('squat-barre', 1, 100, null, 2)] })]);
    expect(advise(vide, squat, 1)).toMatchObject({ weight: 100, reps: 8, trend: 'hold' });
  });

  it('retombe sur la derniere serie renseignee quand la serie demandee n\'existe pas', () => {
    expect(advise(avec(historiqueMontee()), squat, 5)).toMatchObject({ weight: 102.5, trend: 'up' });
  });
});

describe('advise — la transposition entre cycles', () => {
  const force = etape(item('squat-barre', { repMin: 5, repMax: 6 }));

  it("reporte 100 kg × 8 a RIR 2 sur 107,5 kg pour 5 repetitions (l'exemple du README)", () => {
    const a = advise(avec(historiqueCycle()), force, 3);
    expect(a).toMatchObject({ weight: 107.5, reps: 5, trend: 'shift', from: 100 });
    expect(a?.reason).toBe('8 reps → 5 · 1rm est. 133 kg');
  });

  it("applique le meme rapport a la rampe d'echauffement, arrondi en dessous", () => {
    const s = avec(historiqueCycle());
    expect(advise(s, force, 1)).toMatchObject({ weight: 62.5, trend: 'shift', from: 60 });
    expect(advise(s, force, 2)).toMatchObject({ weight: 85, trend: 'shift', from: 80 });
  });

  it('peut descendre, en passant de la force a l\'endurance', () => {
    const endurance = etape(item('squat-barre', { repMin: 15, repMax: 20, targetRirMin: 3 }));
    const a = advise(avec(historiqueCycle()), endurance, 3) as Advice;
    expect(a.trend).toBe('shift');
    expect(a.weight).toBeLessThan(100);
    expect(gainLabel(a)).toMatch(/^−[\d,]+ kg$/);
  });

  it('ne transpose ni sans RIR, ni au-dela de douze repetitions a l\'echec, ni sans fourchette', () => {
    expect(advise(avec(historiqueCycle(false)), force, 3)?.trend).toBe('hold');
    // 12 reps a RIR 4 : seize a l'echec, Epley extrapole — la double progression reprend la main.
    const long = avec([journal({ date: '2026-09-11', series: [serie('squat-barre', 1, 100, 12, 4)] })]);
    expect(advise(long, force, 1)?.trend).toBe('up');
    const sans = etape(item('squat-barre', { repMin: null, repMax: null }));
    expect(advise(avec(historiqueCycle()), sans, 3)?.trend).toBe('hold');
  });

  it('ne dit rien quand la charge transposee est la meme, ou nulle', () => {
    // 100 kg × 10 a RIR 5 : 1RM 150 ; pour 12 reps a RIR 3, 150 / 1,5 = 100 kg, la charge d'origine.
    const proche = etape(item('squat-barre', { repMin: 12, repMax: 15, targetRirMin: 3 }));
    const meme = avec([journal({ date: '2026-09-11', series: [serie('squat-barre', 1, 100, 10, 5)] })]);
    expect(advise(meme, proche, 1)).toMatchObject({ weight: 100, trend: 'reps' });
    const zero = avec([journal({ date: '2026-09-11', series: [serie('squat-barre', 1, 0, 8, 2)] })]);
    // Au poids du corps (charge nulle), rien a transposer : la double progression parle.
    expect(advise(zero, force, 1)).toMatchObject({ weight: 2.5, trend: 'up' });
  });
});

describe('gainLabel', () => {
  const base: Advice = { weight: 0, reps: 0, trend: 'hold', reason: '', from: 0 };
  it('nomme chaque tendance', () => {
    expect(gainLabel({ ...base, trend: 'up' })).toBe('+2,5 kg');
    expect(gainLabel({ ...base, trend: 'reps' })).toBe('+1 rep');
    expect(gainLabel({ ...base, trend: 'shift', weight: 107.5, from: 100 })).toBe('+7,5 kg');
    expect(gainLabel({ ...base, trend: 'shift', weight: 90, from: 100 })).toBe('−10 kg');
    expect(gainLabel(base)).toBe('');
  });
});

describe('plateau — trois seances sans montee', () => {
  it('constate trois seances a la meme charge sans un rep de plus', () => {
    expect(plateau(avec(historiquePalier()), squat)).toEqual({ sessions: 3, weight: 100 });
  });

  it("ne dit rien avant trois seances, ni si la charge a bouge", () => {
    expect(plateau(avec(historiquePalier().slice(1)), squat)).toBeNull();
    const logs = historiquePalier();
    logs[0].entries[2].weight = 97.5;
    expect(plateau(avec(logs), squat)).toBeNull();
  });

  it('compte une montee en reps comme une progression', () => {
    const logs = historiquePalier();
    logs[2].entries[2].reps = 9;
    expect(plateau(avec(logs), squat)).toBeNull();
  });

  it('ignore une seance sans RIR sans rompre la serie', () => {
    const logs = historiquePalier();
    logs[1].entries[2].rir = null;
    logs.push(journal({ date: '2026-09-13', series: [serie('squat-barre', 1, 100, 8, 1)] }));
    expect(plateau(avec(logs), squat)).toEqual({ sessions: 3, weight: 100 });
  });

  it('compte plus de trois seances quand le palier dure', () => {
    const logs = [...historiquePalier(), journal({ date: '2026-09-13', series: [serie('squat-barre', 1, 100, 8, 1)] })];
    expect(plateau(avec(logs), squat)?.sessions).toBe(4);
  });
});

describe('deloadWeight', () => {
  it('retire un cran, jamais sous zero', () => {
    expect(deloadWeight(100)).toBe(97.5);
    expect(deloadWeight(1)).toBe(0);
  });
});
