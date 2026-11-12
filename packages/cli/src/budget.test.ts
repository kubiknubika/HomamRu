// Бюджеты скорости ядра из docs/mechanics/stage-1.md.
// Тест лежит здесь, а не в ядре: ядру запрещено системное время.
// Стоимости путей посчитаны скриптом docs/mechanics/examples/movement.py.
import { CREATURES, TEST_ARMY } from "@homamru/core/testkit";
import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { applyCommand, createGame, findPath } from "@homamru/core";
import type { Direction, GameState } from "@homamru/core";

const SIZE = 144;
const PATH_BUDGET_MS = 50;
const COMMAND_BUDGET_MS = 5;

function gameOn(terrain: string[]): GameState {
  const created = createGame(
    {
      id: "budget",
      name: "Нагрузка",
      terrain,
      players: [{ hero: { x: 0, y: 0, army: TEST_ARMY } }],
    },
    1,
    CREATURES,
  );
  if (!created.ok) {
    throw new Error(created.errors.map((error) => error.message).join("\n"));
  }
  return created.state;
}

/** Открытое поле: поиску приходится обойти все клетки. */
function openField(): string[] {
  return Array.from({ length: SIZE }, () => ".".repeat(SIZE));
}

/** Змейка: стены через строку с проходом то справа, то слева — самый длинный путь. */
function snake(): string[] {
  return Array.from({ length: SIZE }, (_, y) => {
    if (y % 2 === 0) {
      return ".".repeat(SIZE);
    }
    const wall = "#".repeat(SIZE - 1);
    return y % 4 === 1 ? `${wall}.` : `.${wall}`;
  });
}

/** Наименьшее время из нескольких запусков: так случайные задержки машины не мешают. */
function bestTime(runs: number, action: () => void): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < runs; i += 1) {
    const started = performance.now();
    action();
    best = Math.min(best, performance.now() - started);
  }
  return best;
}

describe("бюджет скорости ядра", () => {
  it.each([
    ["открытое поле", openField(), 20_122],
    ["змейка", snake(), 1_021_181],
  ])("поиск пути на карте 144×144 (%s) укладывается в 50 мс", (_, terrain, cost) => {
    const state = gameOn(terrain);
    const target = { x: SIZE - 1, y: SIZE - 2 };
    expect(findPath(state, "A", target)).toMatchObject({ found: true, cost });
    const time = bestTime(7, () => findPath(state, "A", target));
    expect(time).toBeLessThan(PATH_BUDGET_MS);
  });

  it("поиск недостижимой клетки на карте 144×144 укладывается в 50 мс", () => {
    const terrain = openField();
    terrain[SIZE - 2] = "#".repeat(SIZE);
    const state = gameOn(terrain);
    const target = { x: SIZE - 1, y: SIZE - 1 };
    expect(findPath(state, "A", target)).toEqual({ found: false });
    expect(bestTime(7, () => findPath(state, "A", target))).toBeLessThan(PATH_BUDGET_MS);
  });

  it("применение команды на карте 144×144 укладывается в 5 мс", () => {
    const state = gameOn(openField());
    const path: Direction[] = Array.from({ length: 10 }, () => "E");
    const move = { type: "moveHero", player: 0, heroId: "A", path } as const;
    const endTurn = { type: "endTurn", player: 0 } as const;
    expect(applyCommand(state, move).ok).toBe(true);
    expect(bestTime(20, () => applyCommand(state, move))).toBeLessThan(COMMAND_BUDGET_MS);
    expect(bestTime(20, () => applyCommand(state, endTurn))).toBeLessThan(COMMAND_BUDGET_MS);
  });
});
