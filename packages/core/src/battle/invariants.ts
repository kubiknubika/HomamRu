/**
 * Свойства боя, верные всегда (разделы «Свойства, верные всегда» документов 10–13).
 * Проверяются в автобоях после каждой команды.
 */
import { speedOf } from "./effects.ts";
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
  for (const field of state.fields) {
    if (field.rounds < 1) {
      problems.push("постройка с истёкшим сроком осталась на поле");
    }
    for (const cell of field.cells) {
      if (alive.some((stack) => stack.col === cell.col && stack.row === cell.row)) {
        problems.push(`отряд стоит на постройке (${cell.col}, ${cell.row})`);
      }
      if (state.obstacles.some((item) => item.col === cell.col && item.row === cell.row)) {
        problems.push(`постройка на препятствии (${cell.col}, ${cell.row})`);
      }
    }
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
    // Действия заклинаний: срок от раунда, одно заклинание — одно действие (62-battle-spells.md).
    if (stack.effects.some((effect) => effect.rounds < 1)) {
      problems.push(`${stack.id}: действие заклинания с истёкшим сроком`);
    }
    if (new Set(stack.effects.map((effect) => effect.spell)).size !== stack.effects.length) {
      problems.push(`${stack.id}: одно заклинание действует дважды`);
    }
  }
  if (state.sides.some((side) => (side.hero?.mana ?? 0) < 0)) {
    problems.push("мана героя меньше нуля");
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
    if (state.result.reason === "bothDestroyed") {
      if (sidesAlive.includes(true)) {
        problems.push("обе армии погибли, а отряды остались");
      }
    } else if (sidesAlive[state.result.winner] !== true) {
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
      if (stack === undefined || distance(event.from, event.to) > speedOf(stack)) {
        problems.push(`${event.stackId} прошёл дальше своей скорости`);
      }
    }
    if (event.type === "strike" && event.damage < 1) {
      problems.push(`удар ${event.attackerId} с уроном меньше 1`);
    }
  }
  // Ответ — один на удар; отряд в берсерке ходит сам, внутри той же команды, и его удар считается отдельно.
  let answers = 0;
  for (const event of events) {
    if (event.type === "berserkTurn") {
      answers = 0;
    } else if (event.type === "strike" && event.kind === "retaliation") {
      answers += 1;
      if (answers === 2) {
        problems.push("два ответных удара за одну команду");
      }
    }
  }
  return problems;
}
