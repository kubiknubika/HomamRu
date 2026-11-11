/**
 * Текстовый вывод состояния и событий. Это запрос: он ничего не меняет.
 * Спецификация: docs/mechanics/05-diagnostics.md.
 */
import { DAILY_MOVEMENT, heroIdOf } from "./game.ts";
import { calendarOf } from "./time.ts";
import type { GameEvent, GameState, Position } from "./types.ts";

const PATH_SYMBOL = "*";

function formatDate(day: number): string {
  const { month, week, weekday } = calendarOf(day);
  return `месяц ${month}, неделя ${week}, день ${weekday}`;
}

function formatCell(cell: Position): string {
  return `(${cell.x}, ${cell.y})`;
}

/** Печатает состояние символами; клетки пути помечаются звёздочкой. */
export function renderState(state: GameState, path: readonly Position[] = []): string {
  const { map } = state;
  const rows = map.terrain.map((row) => [...row]);
  for (const cell of path) {
    const row = rows[cell.y];
    if (row !== undefined && cell.x >= 0 && cell.x < row.length) {
      row[cell.x] = PATH_SYMBOL;
    }
  }
  for (const hero of state.heroes) {
    const row = rows[hero.y];
    if (row !== undefined) {
      row[hero.x] = heroIdOf(hero.owner);
    }
  }

  const labelWidth = Math.max(2, String(map.height - 1).length);
  const header = Array.from({ length: map.width }, (_, x) => String(x % 10)).join("");
  const lines = [
    `День ${state.day} (${formatDate(state.day)}). Ход игрока ${state.currentPlayer + 1}.`,
    ...state.heroes.map(
      (hero) =>
        `Герой ${hero.id}: клетка ${formatCell(hero)}, запас хода ${hero.movement} из ${DAILY_MOVEMENT}.`,
    ),
    "",
    `${" ".repeat(labelWidth)} ${header}`,
    ...rows.map((row, y) => `${String(y).padStart(labelWidth)} ${row.join("")}`),
  ];
  return lines.join("\n");
}

/** Печатает событие одной строкой. */
export function formatEvent(event: GameEvent): string {
  switch (event.type) {
    case "heroStepped":
      return `Герой ${event.heroId}: шаг ${formatCell(event.from)} → ${formatCell(event.to)}, потрачено ${event.cost}, осталось ${event.movementLeft}`;
    case "turnEnded":
      return `Игрок ${event.player + 1} закончил ход`;
    case "dayStarted":
      return `Начался день ${event.day} (${formatDate(event.day)})`;
  }
}
