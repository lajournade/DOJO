export const EXERCISE_FAMILIES = {
  'horizontal-push': {
    label: 'Horizontal Push',
    exerciseIds: [
      'barbell-bench-press',
      'developpe-incline-halteres-30',
      'developpe-incline-30o',
    ],
  },
  'vertical-push': {
    label: 'Vertical Push',
    exerciseIds: [
      'developpe-militaire-halteres-assis',
      'seated-dumbbell-shoulder-press',
      'dips-lestes',
    ],
  },
  'horizontal-pull': {
    label: 'Horizontal Pull',
    exerciseIds: [
      'rowing-haltere-un-bras',
      'rowing-machine-appui-buste',
      'seated-row',
      'face-pull-a-la-poulie',
    ],
  },
  'vertical-pull': {
    label: 'Vertical Pull',
    exerciseIds: [
      'traction-pronation-lestee',
      'tractions-pronation-prise-large',
      'tractions-assistees',
      'traction',
      'tirage-vertical',
      'tirage-vertical-prise-neutre',
      'lat-machine',
      'vertical-traction',
      'verrical-traction',
      'pull-over-a-la-poulie-haute',
    ],
  },
  quads: {
    label: 'Quads',
    exerciseIds: [
      'squat-barre',
      'smith-machine-squat',
      'squat-free',
      'pendulum-squat',
      'fente-bulgare',
      'fentes-marchees',
      'leg-press',
      'leg-extension',
    ],
  },
  'posterior-chain': {
    label: 'Posterior Chain',
    exerciseIds: [
      'souleve-de-terre',
      'souleve-de-terre-roumain',
      'souleve-de-terre-jambes-tendues',
      'leg-curl-assis',
      'prone-leg-curl',
      'hip-thrust-barre',
      'kickback-fessier-poulie',
      'abduction-hanches-machine',
    ],
  },
  'arm-shoulder-isolation': {
    label: 'Arm & Shoulder Isolation',
    exerciseIds: [
      'elevations-laterales-halteres',
      'elevations-laterales-a-la-poulie',
      'curl-inverse-barre-ez',
      'curl-biceps-a-la-poulie-basse',
      'curl-incline-halteres',
      'curl-halteres',
      'arm-curl-machine',
      'cable-triceps-pushdown',
      'extension-triceps-corde-nuque-poulie-haute',
    ],
  },
  core: {
    label: 'Core',
    exerciseIds: [
      'drapeau-du-dragon',
      'gainage',
      'crunch-poulie',
      'releve-genoux-suspendu',
    ],
  },
};

const familyByExerciseId = new Map();
for (const [family, { exerciseIds }] of Object.entries(EXERCISE_FAMILIES)) {
  for (const id of exerciseIds) familyByExerciseId.set(id, family);
}

export function withExerciseFamily(exercise) {
  if (exercise.family != null) return exercise;
  const family = familyByExerciseId.get(exercise.id);
  return family ? { ...exercise, family } : exercise;
}
