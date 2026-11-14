/** Рабочая копия состояния боя: её меняет команда, пока применяется. */
import { nextInt } from "../rng.ts";
import type { RngState } from "../rng.ts";
import type { SiegeState } from "./siege.ts";
import { BATTLE_VERSION } from "./types.ts";
import type {
  BattleEvent,
  BattleResult,
  BattleSide,
  BattleSideState,
  BattleState,
  StackState,
} from "./types.ts";

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export interface BattleDraft {
  rng: RngState;
  round: number;
  readonly obstacles: BattleState["obstacles"];
  siege: SiegeState | null;
  readonly sides: readonly [BattleSideState, BattleSideState];
  readonly stacks: Mutable<StackState>[];
  activeStack: string | null;
  lastActedSide: BattleSide;
  result: BattleResult | null;
  readonly events: BattleEvent[];
}

export function toDraft(state: BattleState): BattleDraft {
  return {
    rng: state.rng,
    round: state.round,
    obstacles: state.obstacles,
    siege: state.siege,
    sides: state.sides,
    stacks: state.stacks.map((stack) => ({ ...stack })),
    activeStack: state.activeStack,
    lastActedSide: state.lastActedSide,
    result: state.result,
    events: [],
  };
}

/** Собирает неизменяемое состояние из рабочей копии. */
export function toState(draft: BattleDraft): BattleState {
  return {
    version: BATTLE_VERSION,
    rng: draft.rng,
    round: draft.round,
    obstacles: draft.obstacles,
    siege: draft.siege,
    sides: draft.sides,
    stacks: draft.stacks,
    activeStack: draft.activeStack,
    lastActedSide: draft.lastActedSide,
    result: draft.result,
  };
}

/** Жребий «N из граней»: случилось, если выпало не больше N. */
export function rollChance(draft: BattleDraft, chances: number, dice: number): boolean {
  const roll = nextInt(draft.rng, 1, dice);
  draft.rng = roll.rng;
  return roll.value <= chances;
}

/** Случайное целое от `min` до `max` включительно. */
export function rollInt(draft: BattleDraft, min: number, max: number): number {
  const roll = nextInt(draft.rng, min, max);
  draft.rng = roll.rng;
  return roll.value;
}
