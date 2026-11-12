// Бюджеты скорости ядра из docs/mechanics/stage-1.md.
// Тест лежит здесь, а не в ядре: ядру запрещено системное время.
// Стоимости путей посчитаны скриптом docs/mechanics/examples/movement.py.
import { TEST_ARMY, CONTENT } from "@homamru/core/testkit";
import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { applyCommand, createGame, findPath, playBattleOut, replay } from "@homamru/core";
import type { Direction, GameState, MapObjectDefinition } from "@homamru/core";

const SIZE = 144;
const PATH_BUDGET_MS = 50;
const COMMAND_BUDGET_MS = 5;
const STAGE3_PATH_BUDGET_MS = 20;

function gameOn(terrain: string[]): GameState {
  const created = createGame(
    {
      id: "budget",
      name: "Нагрузка",
      terrain,
      players: [{ hero: { x: 0, y: 0, army: TEST_ARMY } }],
    },
    1,
    CONTENT,
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

/** Карта 72×72 этапа 3: охранник в каждой шестой клетке по обеим осям, шахты и кучки между ними. */
function guardedGame(): GameState {
  const size = 72;
  const objects: MapObjectDefinition[] = [];
  for (let y = 3; y < size; y += 6) {
    for (let x = 3; x < size; x += 6) {
      objects.push(
        { type: "guard", x, y, creature: "militia", count: 20 },
        { type: "mine", x: x + 1, y, kind: "sawmill" },
        { type: "pile", x, y: y + 2, resource: "gold" },
      );
    }
  }
  const created = createGame(
    {
      id: "guarded",
      name: "Нагрузка с охранниками",
      terrain: Array.from({ length: size }, () => ".".repeat(size)),
      players: [{ hero: { x: 0, y: 0, army: [{ creature: "falcon", count: 400 }] } }],
      objects,
    },
    1,
    CONTENT,
  );
  if (!created.ok) {
    throw new Error(created.errors.map((error) => error.message).join("\n"));
  }
  return created.state;
}

// Бюджеты из docs/mechanics/stage-3.md.
describe("бюджет скорости ядра с объектами и охранниками", () => {
  const state = guardedGame();

  it("поиск пути на карте 72×72 с охранниками укладывается в 20 мс", () => {
    expect(state.objects.length).toBe(432);
    for (const target of [
      { x: 71, y: 71 },
      { x: 69, y: 69 },
      { x: 70, y: 1 },
    ]) {
      expect(findPath(state, "A", target).found).toBe(true);
      expect(bestTime(7, () => findPath(state, "A", target))).toBeLessThan(STAGE3_PATH_BUDGET_MS);
    }
  });

  it("команды карты и боя на карте 72×72 с охранниками укладываются в 5 мс", () => {
    const toZone = { type: "moveHero", player: 0, heroId: "A", path: ["SE", "SE"] } as const;
    const endTurn = { type: "endTurn", player: 0 } as const;
    const entered = applyCommand(state, toZone);
    expect(entered.ok && entered.state.battle !== null).toBe(true);
    // Вход в зону создаёт бой; конец дня первой недели растит всех охранников.
    expect(bestTime(20, () => applyCommand(state, toZone))).toBeLessThan(COMMAND_BUDGET_MS);
    const sunday = { ...state, day: 7 };
    expect(applyCommand(sunday, endTurn)).toMatchObject({ ok: true, state: { day: 8 } });
    expect(bestTime(20, () => applyCommand(sunday, endTurn))).toBeLessThan(COMMAND_BUDGET_MS);
    // Команды боя — в среднем по всему бою, вместе с его концом и переносом итога на карту.
    const started = performance.now();
    const played = playBattleOut(entered.ok ? entered.state : state);
    const perCommand = (performance.now() - started) / played.commands.length;
    expect(played.state.battle).toBeNull();
    // В это время входит и решение компьютера, у которого свой бюджет — 50 мс.
    expect(perCommand).toBeLessThan(COMMAND_BUDGET_MS + 50);
    const [last] = played.commands.slice(-1);
    const before = replay(entered.ok ? entered.state : state, played.commands.slice(0, -1));
    const final = before.ok && last !== undefined ? before.state : state;
    expect(bestTime(20, () => applyCommand(final, last ?? endTurn))).toBeLessThan(
      COMMAND_BUDGET_MS,
    );
  });
});

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
