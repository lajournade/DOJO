import { describe, expect, it } from 'vitest';
import { GOALS, GOAL_ORDER, blankItem, blankProgram, duplicateProgram, findExercise, nextCode, slug } from './programs';
import { catalogue, programme } from '../test/fabrique';

describe('slug', () => {
  it('retire accents, casse et ponctuation, et borne la longueur', () => {
    expect(slug('Développé couché haltères 30°')).toBe('developpe-couche-halteres-30');
    expect(slug('  Squat  ')).toBe('squat');
    expect(slug('x'.repeat(60))).toHaveLength(48);
    expect(slug('!!!')).toBe('');
  });
});

describe('findExercise', () => {
  it("retrouve par identifiant ou par nom, sans egard a la casse ni aux accents", () => {
    const ex = catalogue();
    expect(findExercise(ex, 'squat-barre')?.name).toBe('Squat barre');
    expect(findExercise(ex, 'DEVELOPPE COUCHE')?.id).toBe('developpe-couche');
    expect(findExercise(ex, 'Curl')).toBeNull();
    expect(findExercise(ex, '   ')).toBeNull();
  });
});

describe('les familles', () => {
  it('pre-remplissent un exercice neuf', () => {
    for (const goal of GOAL_ORDER) {
      const it_ = blankItem(goal);
      expect(it_).toMatchObject({
        exerciseId: '',
        sets: 3,
        repMin: GOALS[goal].repMin,
        repMax: GOALS[goal].repMax,
        targetRirMin: GOALS[goal].rir,
        supersetGroup: null,
      });
      expect(it_.id).toMatch(/^it-/);
    }
    expect(GOALS.force).toMatchObject({ repMin: 3, repMax: 5, rir: 2 });
    expect(GOALS.endurance).toMatchObject({ repMin: 15, repMax: 20, rir: 3 });
  });

  it('blankProgram part vide, avec le code donne', () => {
    expect(blankProgram('force', 'P3')).toMatchObject({ code: 'P3', goal: 'force', sessions: [], name: 'Nouveau programme' });
  });
});

describe('duplicateProgram', () => {
  it('regenere tous les identifiants et suffixe le nom', () => {
    const p = programme();
    const copie = duplicateProgram(p, 'P2');
    expect(copie.name).toBe('Programme test (copie)');
    expect(copie.code).toBe('P2');
    expect(copie.id).not.toBe(p.id);
    expect(copie.sessions.map((s) => s.id)).not.toContain('ses-a');
    expect(copie.sessions[0].items[0].id).not.toBe(p.sessions[0].items[0].id);
    expect(copie.sessions[0].items[0].exerciseId).toBe('squat-barre');
  });
});

describe('nextCode', () => {
  it('prend le premier code libre', () => {
    expect(nextCode([])).toBe('P1');
    expect(nextCode([programme({ code: 'P1' }), programme({ code: 'P3' })])).toBe('P2');
  });
});
