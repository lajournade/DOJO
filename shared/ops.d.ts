import type { AppState, Op } from '../src/types';

export function applyOp(state: AppState, op: Op): void;
export function applyBatch(state: AppState, ops: Op[]): number;
