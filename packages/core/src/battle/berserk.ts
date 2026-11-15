/**
 * «Берсерк»: отряд сам нападает на ближайший отряд любой стороны.
 * Спецификация: docs/mechanics/69-spells-control.md.
 */
import { sober } from "./control.ts";
import type { BattleDraft } from "./draft.ts";
import { cellIndex, distance } from "./hex.ts";
import type { Cell } from "./hex.ts";
import { attackCells, canShoot, reachableCells } from "./queries.ts";
import { isMachine } from "./siege.ts";
import { exchange, moveTo, strike } from "./strike.ts";
import type { StackState } from "./types.ts";

type DraftStack = BattleDraft["stacks"][number];

/** Ближайший к отряду живой отряд любой стороны, кроме машин; при равенстве — раньше в списке армий. */
export function nearestTo<T extends StackState>(
  stacks: readonly T[],
  stack: StackState,
): T | undefined {
  let best: T | undefined;
  for (const other of stacks) {
    if (other.id === stack.id || other.count === 0 || isMachine(other)) {
      continue;
    }
    if (best === undefined || distance(stack, other) < distance(stack, best)) {
      best = other;
    }
  }
  return best;
}

/** Клетка с наименьшей оценкой; при равенстве — с меньшим номером. */
function closest(cells: Iterable<Cell>, score: (cell: Cell) => number): Cell | undefined {
  let best: Cell | undefined;
  for (const cell of cells) {
    const better =
      best === undefined ||
      score(cell) < score(best) ||
      (score(cell) === score(best) && cellIndex(cell) < cellIndex(best));
    if (better) {
      best = cell;
    }
  }
  return best;
}

/**
 * Ход отряда в берсерке: стрелок, которому никто не мешает, стреляет; остальные идут и бьют;
 * не дотянулся — идёт в сторону цели. После удара или выстрела берсерк проходит.
 */
export function berserkAct(draft: BattleDraft, stack: DraftStack): void {
  const target = nearestTo(draft.stacks, stack);
  draft.events.push({ type: "berserkTurn", stackId: stack.id, targetId: target?.id ?? null });
  if (target === undefined) {
    return;
  }
  if (canShoot(draft, stack)) {
    stack.shots -= 1;
    strike(draft, stack, target, "shot");
    sober(draft, stack);
    return;
  }
  const from = closest(attackCells(draft, stack, target), (cell) => distance(stack, cell));
  if (from !== undefined) {
    moveTo(draft, stack, from);
    if (stack.count > 0) {
      exchange(draft, stack, target);
      sober(draft, stack);
    }
    return;
  }
  const step = closest(reachableCells(draft, stack).values(), (cell) => distance(cell, target));
  if (step !== undefined && distance(step, target) < distance(stack, target)) {
    moveTo(draft, stack, step);
  }
}
