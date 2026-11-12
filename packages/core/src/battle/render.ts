/**
 * Текстовый вывод боя: поле символами и события словами.
 * Спецификация: docs/mechanics/16-battle-screen.md.
 */
import { BATTLE_HEIGHT, BATTLE_WIDTH, cellIndex } from "./hex.ts";
import { activeStackOf } from "./queries.ts";
import type { BattleEvent, BattleSide, BattleState, StackState } from "./types.ts";

const SIDE_NAMES = ["нападающий", "обороняющийся"] as const;
const CELL_WIDTH = 3;

function sideName(side: BattleSide): string {
  return SIDE_NAMES[side];
}

function headerOf(state: BattleState): string {
  if (state.result !== null) {
    const how = state.result.reason === "fled" ? "противник бежал" : "противник уничтожен";
    return `Бой окончен в раунде ${state.round}. Победил ${sideName(state.result.winner)}: ${how}.`;
  }
  const active = activeStackOf(state);
  if (active === undefined) {
    return `Раунд ${state.round}.`;
  }
  const who = `${active.id} ${active.creature.name} (${active.count})`;
  return `Раунд ${state.round}. Ход: ${sideName(active.side)}, ${who}.`;
}

function stackLine(stack: StackState): string {
  const title = `${stack.id} ${stack.creature.name}`;
  if (stack.count === 0) {
    return `${title}: погиб, было ${stack.initialCount}`;
  }
  const parts = [
    `${stack.count} из ${stack.initialCount}`,
    `здоровье первого ${stack.firstHealth}`,
    `клетка (${stack.col}, ${stack.row})`,
  ];
  if (stack.creature.shots > 0) {
    parts.push(`выстрелов ${stack.shots}`);
  }
  if (stack.turn === "waiting" || stack.turn === "waitingAfterMorale") {
    parts.push("ждал");
  }
  if (stack.defendBonus > 0) {
    parts.push(`защищается (+${stack.defendBonus})`);
  }
  if (stack.retaliated) {
    parts.push("отвечал");
  }
  return `${title}: ${parts.join(", ")}`;
}

/** Печатает бой: заголовок, поле, список отрядов. Чётные ряды сдвинуты вправо. */
export function renderBattle(state: BattleState): string {
  const marks = new Map<number, string>();
  for (const cell of state.obstacles) {
    marks.set(cellIndex(cell), "#");
  }
  for (const stack of state.stacks) {
    if (stack.count > 0) {
      marks.set(cellIndex(stack), stack.id);
    }
  }
  const lines = [headerOf(state), ""];
  let numbers = "     ";
  for (let col = 0; col < BATTLE_WIDTH; col += 1) {
    numbers += String(col).padStart(CELL_WIDTH);
  }
  lines.push(numbers);
  for (let row = 0; row < BATTLE_HEIGHT; row += 1) {
    let line = String(row).padStart(2) + (row % 2 === 0 ? "   " : " ");
    for (let col = 0; col < BATTLE_WIDTH; col += 1) {
      line += (marks.get(cellIndex({ col, row })) ?? ".").padStart(CELL_WIDTH);
    }
    lines.push(line);
  }
  lines.push("", ...state.stacks.map(stackLine));
  return lines.join("\n");
}

const STRIKE_NAMES = { melee: "бьёт", retaliation: "отвечает", shot: "стреляет в" } as const;

/** Событие боя одной строкой по-русски. */
export function formatBattleEvent(event: BattleEvent): string {
  switch (event.type) {
    case "roundStarted":
      return `Раунд ${event.round}`;
    case "stackTurn":
      return `Ход отряда ${event.stackId}`;
    case "stackFroze":
      return `Отряд ${event.stackId} оцепенел: низкий боевой дух`;
    case "stackMoved":
      return `Отряд ${event.stackId}: (${event.from.col}, ${event.from.row}) → (${event.to.col}, ${event.to.row})`;
    case "strike": {
      const luck = event.lucky ? ", удача" : "";
      return `Отряд ${event.attackerId} ${STRIKE_NAMES[event.kind]} ${event.targetId}: урон ${event.damage}${luck}, убито ${event.killed}, осталось ${event.left}`;
    }
    case "stackDied":
      return `Отряд ${event.stackId} погиб`;
    case "stackWaits":
      return `Отряд ${event.stackId} ждёт`;
    case "stackDefends":
      return `Отряд ${event.stackId} защищается: защита +${event.bonus}`;
    case "moraleTurn":
      return `Отряд ${event.stackId} ходит ещё раз: высокий боевой дух`;
    case "sideFled":
      return `Бежит ${sideName(event.side)}`;
    case "battleEnded":
      return `Бой окончен. Победил ${sideName(event.result.winner)}`;
  }
}
