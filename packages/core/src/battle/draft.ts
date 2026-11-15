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

/** Сторона в рабочей копии: мана героя и отметка «колдовал» меняются. */
type DraftSide = Mutable<Omit<BattleSideState, "hero">> & {
  hero: Mutable<NonNullable<BattleSideState["hero"]>> | null;
};

function draftSide(side: BattleSideState): DraftSide {
  return { ...side, hero: side.hero === null ? null : { ...side.hero } };
}

export interface BattleDraft {
  rng: RngState;
  round: number;
  obstacles: BattleState["obstacles"];
  fields: BattleState["fields"];
  siege: SiegeState | null;
  readonly sides: [DraftSide, DraftSide];
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
    fields: state.fields,
    siege: state.siege,
    sides: [draftSide(state.sides[0]), draftSide(state.sides[1])],
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
    fields: draft.fields,
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
