/**
 * Очерёдность ходов, раунды, боевой дух, конец боя.
 * Спецификация: docs/mechanics/11-battle-turns.md.
 */
import { nextInt } from "../rng.ts";
import type { RngState } from "../rng.ts";
import { BAD_DICE } from "./damage.ts";
import type {
  BattleEndReason,
  BattleEvent,
  BattleResult,
  BattleSide,
  BattleSideState,
  StackState,
  StackTurn,
} from "./types.ts";

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** Рабочая копия состояния боя: её меняет команда, пока применяется. */
export interface BattleDraft {
  rng: RngState;
  round: number;
  readonly sides: readonly [BattleSideState, BattleSideState];
  readonly stacks: Mutable<StackState>[];
  activeStack: string | null;
  lastActedSide: BattleSide;
  result: BattleResult | null;
  readonly events: BattleEvent[];
}

/** Жребий «N из граней»: случилось, если выпало не больше N. */
export function rollChance(draft: BattleDraft, chances: number, dice: number): boolean {
  const roll = nextInt(draft.rng, 1, dice);
  draft.rng = roll.rng;
  return roll.value <= chances;
}

/** Части раунда по порядку: кто в них ходит и с какой скорости начинают. */
const PHASES: readonly { readonly turn: StackTurn; readonly fastestFirst: boolean }[] = [
  { turn: "ready", fastestFirst: true },
  { turn: "waitingAfterMorale", fastestFirst: false },
  { turn: "waiting", fastestFirst: false },
];

/** Что нужно знать, чтобы выбрать следующий отряд. */
interface TurnOrder {
  readonly stacks: readonly StackState[];
  readonly lastActedSide: BattleSide;
}

function goesBefore(
  draft: TurnOrder,
  stack: StackState,
  other: StackState,
  fastestFirst: boolean,
): boolean {
  const speed = stack.creature.speed;
  const otherSpeed = other.creature.speed;
  if (speed !== otherSpeed) {
    return fastestFirst ? speed > otherSpeed : speed < otherSpeed;
  }
  if (stack.side !== other.side) {
    // При равной скорости ходит сторона, которая ходила не последней.
    return stack.side !== draft.lastActedSide;
  }
  return stack.slot < other.slot;
}

/** Следующий отряд в этом раунде; `undefined`, если раунд закончился. */
function pickNext<S extends StackState>(draft: {
  readonly stacks: readonly S[];
  readonly lastActedSide: BattleSide;
}): S | undefined {
  for (const phase of PHASES) {
    let best: S | undefined;
    for (const stack of draft.stacks) {
      if (stack.count === 0 || stack.turn !== phase.turn) {
        continue;
      }
      if (best === undefined || goesBefore(draft, stack, best, phase.fastestFirst)) {
        best = stack;
      }
    }
    if (best !== undefined) {
      return best;
    }
  }
  return undefined;
}

function startRound(draft: BattleDraft): void {
  draft.round += 1;
  for (const stack of draft.stacks) {
    stack.turn = stack.count > 0 ? "ready" : "done";
    stack.moraleUsed = false;
    stack.retaliated = false;
  }
  draft.events.push({ type: "roundStarted", round: draft.round });
}

/**
 * Передаёт ход следующему отряду. Начинает новый раунд, если в этом ходить некому.
 * Отряд с низким боевым духом может оцепенеть — тогда ход уходит дальше.
 */
export function activateNext(draft: BattleDraft): void {
  for (;;) {
    let next = pickNext(draft);
    if (next === undefined) {
      startRound(draft);
      next = pickNext(draft);
    }
    if (next === undefined) {
      // Живых отрядов нет: бой должен был закончиться раньше.
      draft.activeStack = null;
      return;
    }
    draft.lastActedSide = next.side;
    // Прибавка от «защищаться» действует до начала следующего хода отряда.
    next.defendBonus = 0;
    const morale = draft.sides[next.side].morale;
    // Оцепенение проверяется один раз за раунд — когда отряд ходит в основной части.
    if (next.turn === "ready" && morale < 0 && rollChance(draft, -morale, BAD_DICE)) {
      next.turn = "done";
      draft.events.push({ type: "stackFroze", stackId: next.id });
      continue;
    }
    draft.activeStack = next.id;
    draft.events.push({ type: "stackTurn", stackId: next.id });
    return;
  }
}

/** Заканчивает бой: записывает итог и потери. */
export function endBattle(draft: BattleDraft, winner: BattleSide, reason: BattleEndReason): void {
  draft.result = {
    winner,
    reason,
    losses: draft.stacks.map((stack) => ({
      stackId: stack.id,
      lost: stack.initialCount - stack.count,
    })),
  };
  draft.activeStack = null;
  draft.events.push({ type: "battleEnded", result: draft.result });
}

/** Если у одной из сторон не осталось отрядов — заканчивает бой. Возвращает, закончен ли он. */
export function endIfDestroyed(draft: BattleDraft): boolean {
  for (const side of [0, 1] as const) {
    if (!draft.stacks.some((stack) => stack.side === side && stack.count > 0)) {
      endBattle(draft, side === 0 ? 1 : 0, "destroyed");
      return true;
    }
  }
  return false;
}

/**
 * Очередь ходов до конца раунда: отряд, чей сейчас ход, и те, кто пойдёт за ним,
 * если никто не будет ждать, не оцепенеет и не получит второй ход.
 */
export function turnQueue(state: TurnOrder & { readonly activeStack: string | null }): string[] {
  const active = state.stacks.find((stack) => stack.id === state.activeStack);
  if (active === undefined) {
    return [];
  }
  const queue = [active.id];
  let stacks = state.stacks.map((stack) =>
    stack.id === active.id ? { ...stack, turn: "done" as const } : stack,
  );
  let lastActedSide = active.side;
  for (;;) {
    const next = pickNext({ stacks, lastActedSide });
    if (next === undefined) {
      return queue;
    }
    queue.push(next.id);
    lastActedSide = next.side;
    stacks = stacks.map((stack) => (stack.id === next.id ? { ...stack, turn: "done" } : stack));
  }
}
