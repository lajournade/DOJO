import type { CSSProperties } from 'react';
import { EXERCISE_FAMILIES } from '../../shared/exercise-families.mjs';
import { doneSets, stepStatus } from '../store/session';
import type { Exercise, ExerciseFamily, LiveSession } from '../types';
import './FamilyProgress.css';

// Chaque masque est un pictogramme monochrome dessiné sur une grille de 14 × 10.
const tiles = {
  'horizontal-push': {
    short: 'PUSH H',
    pixels: [0x00a0, 0x01e0, 0x40a0, 0x43a4, 0x4cc6, 0x7fce, 0x7ff8, 0x0408, 0x0408, 0],
  },
  'vertical-push': {
    short: 'PUSH V',
    pixels: [0x1002, 0x3fff, 0x1002, 0x0a14, 0x04e8, 0x03f0, 0x00c0, 0x01e0, 0x0120, 0x0320],
  },
  'horizontal-pull': {
    short: 'PULL H',
    pixels: [0, 0x0030, 0x0030, 0x0fc0, 0x1bf4, 0x307c, 0x2074, 0x07ff, 0x0408, 0x0408],
  },
  'vertical-pull': {
    short: 'PULL V',
    pixels: [0x3fff, 0x2221, 0x2221, 0x22a1, 0x21c1, 0x20c1, 0x20e1, 0x20a1, 0x2001, 0x2001],
  },
  quads: {
    short: 'QUADS',
    pixels: [0x00c0, 0x00c0, 0x01e0, 0x0760, 0x09b0, 0x01e0, 0x03c0, 0x0620, 0x0440, 0x0ee0],
  },
  'posterior-chain': {
    short: 'POST',
    pixels: [0x0018, 0x0018, 0x0060, 0x01e0, 0x07b0, 0x0b10, 0x0a10, 0x1210, 0x1310, 0x1b3c],
  },
  'arm-shoulder-isolation': {
    short: 'BRAS',
    pixels: [0x1002, 0x150a, 0x23c5, 0x23c5, 0x3fff, 0x1ffe, 0x0ffc, 0x03f0, 0x0360, 0x03e0],
  },
  core: {
    short: 'CORE',
    pixels: [0x07e0, 0x04a0, 0x04a0, 0x07e0, 0x04a0, 0x04a0, 0x07e0, 0x0240, 0x0240, 0x03c0],
  },
} satisfies Record<ExerciseFamily, { short: string; pixels: number[] }>;

const familyOrder = Object.keys(tiles) as ExerciseFamily[];

const iconShadows = Object.fromEntries(familyOrder.map((family) => [
  family,
  tiles[family].pixels.flatMap((row, y) =>
    Array.from({ length: 14 }, (_, x) => (row & (1 << (13 - x))) ? `${x * 2}px ${y * 2}px currentColor` : null)
      .filter(Boolean),
  ).join(', '),
]));

interface Segment {
  id: string;
  active: boolean;
  done: boolean;
}

export function FamilyProgress({ live, exercises }: { live: LiveSession; exercises: Exercise[] }) {
  const free = live.mode === 'free';
  const familyByExerciseId = new Map(exercises.map(({ id, family }) => [id, family]));
  const segmentsByFamily = new Map<ExerciseFamily, Segment[]>();

  live.plan.forEach((step, index) => {
    const family = familyByExerciseId.get(step.exerciseId);
    if (!family || !Object.hasOwn(tiles, family)) return;
    const segments = segmentsByFamily.get(family) ?? [];
    segments.push({
      id: step.id,
      active: index === live.cursor.planIndex,
      done: free ? doneSets(live, index) > 0 : stepStatus(live, index) === 'done',
    });
    segmentsByFamily.set(family, segments);
  });

  if (free && segmentsByFamily.size === 0) return null;

  return (
    <ul role="list" aria-label="Progression par famille" className="family-progress">
      {familyOrder.map((family) => {
        const segments = segmentsByFamily.get(family) ?? [];
        if (free && segments.length === 0) return null;
        const done = segments.filter((segment) => segment.done).length;
        const active = segments.some((segment) => segment.active);
        const label = `${EXERCISE_FAMILIES[family].label}, ${done} sur ${segments.length} exercices validés`;
        return (
          <li
            key={family}
            data-family={family}
            data-done={done > 0 || undefined}
            aria-current={active || undefined}
            aria-label={active ? `${label}, famille active` : label}
            className="family-progress-tile"
          >
            <span aria-hidden="true" className="family-progress-icon">
              <span className="family-progress-glyph">
                <span style={{ boxShadow: iconShadows[family] }} />
              </span>
              {done > 0 && <span className="family-progress-check" />}
            </span>
            <span aria-hidden="true" className="family-progress-label label-text">{tiles[family].short}</span>
            <span
              aria-hidden="true"
              className="family-progress-segments"
              style={{ '--segment-count': Math.max(1, segments.length) } as CSSProperties}
            >
              {segments.map((segment) => (
                <span
                  key={segment.id}
                  data-status={segment.done ? 'done' : segment.active ? 'active' : 'pending'}
                />
              ))}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
