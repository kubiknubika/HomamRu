/**
 * Свойства боя, верные всегда (разделы «Свойства, верные всегда» документов 10–13).
 * Проверяются в автобоях после каждой команды.
 */
import { cellIndex, distance, inField } from "./hex.ts";
import { findStack } from "./queries.ts";
import { isMachine, wallCells, WALL_PARTS } from "./siege.ts";
import type { BattleEvent, BattleState } from "./types.ts";

/** Нарушения в состоянии боя; пустой список — всё в порядке. */
export function battleProblems(state: BattleState): string[] {
  const problems: string[] = [];
  const alive = state.stacks.filter((stack) => stack.count > 0);
  if (new Set(alive.map((stack) => cellIndex(stack))).size !== alive.length) {
    problems.push("два отряда в одной клетке");
  }
  for (const stack of alive) {
    if (!inField(stack)) {
      problems.push(`${stack.id} вне поля`);
    }
    if (state.obstacles.some((cell) => cell.col === stack.col && cell.row === stack.row)) {
      problems.push(`${stack.id} стоит на препятствии`);
    }
    if (stack.firstHealth < 1 || stack.firstHealth > stack.creature.health) {
      problems.push(`${stack.id}: здоровье первого ${stack.firstHealth}`);
    }
    if (stack.count > stack.initialCount) {
      problems.push(`${stack.id}: существ стало больше, чем было`);
    }
    if (stack.shots < 0 || stack.shots > stack.creature.shots) {
      problems.push(`${stack.id}: выстрелов ${stack.shots}`);
    }
  }
  if (state.siege !== null) {
    const walls = new Set(wallCells(state.siege).map(cellIndex));
    for (const stack of alive) {
      if (walls.has(cellIndex(stack))) {
        problems.push(`${stack.id} стоит на стене`);
      }
    }
    for (const part of WALL_PARTS) {
      if (state.siege.health[part] < 0) {
        problems.push(`прочность ${part} меньше нуля`);
      }
    }
  }
  // Катапульта — не отряд: сторона жива, пока живы её существа.
  const sidesAlive = [0, 1].map((side) =>
    alive.some((stack) => stack.side === side && !isMachine(stack)),
  );
  if (state.result === null) {
    if ((findStack(state, state.activeStack ?? "")?.count ?? 0) === 0) {
      problems.push("ходит погибший или несуществующий отряд");
    }
    if (sidesAlive.includes(false)) {
      problems.push("сторона уничтожена, а бой не окончен");
    }
  } else {
    if (state.activeStack !== null) {
      problems.push("бой окончен, а ход кому-то отдан");
    }
    if (sidesAlive[state.result.winner] !== true) {
      problems.push("у победителя нет отрядов");
    }
    if (state.result.reason === "destroyed" && sidesAlive[1 - state.result.winner] === true) {
      problems.push("проигравший не уничтожен");
    }
  }
  return problems;
}

/** Нарушения в событиях одной команды: `before` — состояние до неё. */
export function eventProblems(before: BattleState, events: readonly BattleEvent[]): string[] {
  const problems: string[] = [];
  for (const event of events) {
    if (event.type === "stackMoved") {
      const stack = findStack(before, event.stackId);
      if (stack === undefined || distance(event.from, event.to) > stack.creature.speed) {
        problems.push(`${event.stackId} прошёл дальше своей скорости`);
      }
    }
    if (event.type === "strike" && event.damage < 1) {
      problems.push(`удар ${event.attackerId} с уроном меньше 1`);
    }
  }
  const strikes = events.filter((event) => event.type === "strike");
  if (strikes.filter((event) => event.kind === "retaliation").length > 1) {
    problems.push("два ответных удара за одну команду");
  }
  return problems;
}
