/**
 * Помощники для тестов ядра. В игре не используются.
 */
import { DAILY_MOVEMENT, heroIdOf } from "./game.ts";
import { createRng } from "./rng.ts";
import { STATE_VERSION } from "./types.ts";
import type { GameState, Position } from "./types.ts";

export interface Picture {
  readonly state: GameState;
  /** Клетка, помеченная `T`; если её нет — клетка героя. */
  readonly target: Position;
}

function findSymbol(rows: readonly string[], symbol: string): Position | undefined {
  for (const [y, row] of rows.entries()) {
    const x = row.indexOf(symbol);
    if (x !== -1) {
      return { x, y };
    }
  }
  return undefined;
}

/**
 * Строит состояние по рисунку из спецификации: `S` — герой, `T` — цель,
 * `B` — герой второго игрока, `#` — преграда, `.` — земля.
 * Размер карты не проверяется: рисунки в примерах меньше наименьшей карты.
 */
export function fromPicture(rows: readonly string[]): Picture {
  const start = findSymbol(rows, "S");
  if (start === undefined) {
    throw new Error("На рисунке нет героя (S).");
  }
  const second = findSymbol(rows, "B");
  const positions = second === undefined ? [start] : [start, second];
  const state: GameState = {
    version: STATE_VERSION,
    rng: createRng(1),
    map: {
      id: "picture",
      name: "Рисунок",
      width: rows[0]?.length ?? 0,
      height: rows.length,
      terrain: rows.map((row) => row.replaceAll(/[STB]/g, ".")),
    },
    players: positions.map((_, id) => ({ id })),
    heroes: positions.map((position, owner) => ({
      id: heroIdOf(owner),
      owner,
      x: position.x,
      y: position.y,
      movement: DAILY_MOVEMENT,
    })),
    day: 1,
    currentPlayer: 0,
  };
  return { state, target: findSymbol(rows, "T") ?? start };
}

/** Открытое поле заданного размера с героем в левом верхнем углу. */
export function openField(size: number): GameState {
  const rows = Array.from({ length: size }, (_, y) => (y === 0 ? "S" : ".") + ".".repeat(size - 1));
  return fromPicture(rows).state;
}
