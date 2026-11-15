/**
 * Очерёдность ходов, раунды, боевой дух, конец боя.
 * Спецификация: docs/mechanics/11-battle-turns.md.
 */
import { berserkAct } from "./berserk.ts";
import { startSpellRound } from "./cast.ts";
import { calmDown } from "./control.ts";
import { BAD_DICE } from "./damage.ts";
import { rollChance } from "./draft.ts";
import type { BattleDraft } from "./draft.ts";
import { startFieldRound } from "./field.ts";
import { scorch } from "./traps.ts";
import { isBerserk, isBlind, moraleOf, speedOf } from "./effects.ts";
import { isMachine } from "./siege.ts";
import { siegePhase } from "./siegeRound.ts";
import type { BattleEndReason, BattleSide, StackState, StackTurn } from "./types.ts";

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
  const speed = speedOf(stack);
  const otherSpeed = speedOf(other);
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
    stack.turn = stack.count > 0 && !isMachine(stack) ? "ready" : "done";
    stack.moraleUsed = false;
    stack.retaliated = false;
  }
  draft.events.push({ type: "roundStarted", round: draft.round });
  startSpellRound(draft);
  startFieldRound(draft);
}

/** Ход отряда в берсерке. Возвращает, закончен ли бой. */
function rage(draft: BattleDraft, stack: BattleDraft["stacks"][number]): boolean {
  berserkAct(draft, stack);
  calmDown(draft, stack);
  stack.turn = "done";
  return endIfDestroyed(draft);
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
      // Осада: в начале раунда стреляют башни и катапульта.
      siegePhase(draft);
      if (endIfDestroyed(draft)) {
        return;
      }
      next = pickNext(draft);
    }
    if (next === undefined) {
      // Живых отрядов нет: бой должен был закончиться раньше.
      draft.activeStack = null;
      return;
    }
    if (isBlind(next)) {
      // Ослеплённый отряд хода не получает (69-spells-control.md).
      next.turn = "done";
      draft.events.push({ type: "stackBlind", stackId: next.id });
      continue;
    }
    draft.lastActedSide = next.side;
    // Прибавка от «защищаться» действует до начала следующего хода отряда.
    next.defendBonus = 0;
    const morale = moraleOf(draft, next);
    // Оцепенение проверяется один раз за раунд — когда отряд ходит в основной части.
    if (next.turn === "ready" && morale < 0 && rollChance(draft, -morale, BAD_DICE)) {
      next.turn = "done";
      draft.events.push({ type: "stackFroze", stackId: next.id });
      continue;
    }
    // Отряд, начавший ход в стене огня, горит ещё раз — один раз за раунд (70-spells-field.md).
    if (next.turn === "ready" && scorch(draft, next)) {
      if (endIfDestroyed(draft)) {
        return;
      }
      continue;
    }
    if (isBerserk(next)) {
      // Отряд в берсерке действует сам, без команды (69-spells-control.md).
      draft.activeStack = next.id;
      if (rage(draft, next)) {
        return;
      }
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
  const alive = (side: BattleSide): boolean =>
    draft.stacks.some((stack) => stack.side === side && stack.count > 0 && !isMachine(stack));
  if (!alive(0) && !alive(1)) {
    // Обе армии погибли разом («Армагеддон»): победителя нет (68-spells-area.md).
    endBattle(draft, 1, "bothDestroyed");
    return true;
  }
  for (const side of [0, 1] as const) {
    // Катапульта — не отряд: сторона с одной катапультой разбита.
    if (
      !draft.stacks.some((stack) => stack.side === side && stack.count > 0 && !isMachine(stack))
    ) {
      endBattle(draft, side === 0 ? 1 : 0, "destroyed");
      return true;
    }
  }
  return false;
}

/**
 * После заклинания: бой мог кончиться; если заклинание по площади убило отряд, чей был ход, —
 * ход переходит дальше (68-spells-area.md).
 */
export function endAfterCast(draft: BattleDraft): void {
  if (endIfDestroyed(draft)) {
    return;
  }
  const active = draft.stacks.find((stack) => stack.id === draft.activeStack);
  if (active === undefined) {
    return;
  }
  if (active.count === 0) {
    activateNext(draft);
  } else if (isBerserk(active) && !rage(draft, active)) {
    // «Берсерк» накрыл отряд, чей был ход: он тут же действует сам.
    activateNext(draft);
  }
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
