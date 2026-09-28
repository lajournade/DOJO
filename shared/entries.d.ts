import type { PlanStep, SetEntry } from '../src/types';
export function entryMatchesStep(entry: SetEntry, step: PlanStep): boolean;
export function isAbandoned(entries: SetEntry[], step: PlanStep): boolean;
export function abandonedCount(entries: SetEntry[]): number;
