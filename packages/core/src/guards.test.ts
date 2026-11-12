// Таблицы и правила из docs/mechanics/21-guards.md. Рост посчитан скриптом examples/hero.py.
import { describe, expect, it } from "vitest";
import { CREATURES } from "./battle/testkit.ts";
import { applyCommand } from "./commands.ts";
import { quantityWord } from "./guards.ts";
import { cellsAlong, validateMap } from "./map.ts";
import { findPath } from "./pathfinding.ts";
import { formatEvent, renderState } from "./render.ts";
import { gameWith, OPEN_FIELD, placeHero, TEST_ARMY } from "./testkit.ts";
import type { Command, Direction, GameState, MapObjectDefinition } from "./types.ts";

function guard(x: number, y: number, count = 15, creature = "militia"): MapObjectDefinition {
  return { type: "guard", x, y, creature, count };
}

function move(path: Direction[]): Command {
  return { type: "moveHero", player: 0, heroId: "A", path };
}

function accepted(state: GameState, command: Command) {
  const result = applyCommand(state, command);
  if (!result.ok) {
    throw new Error(`отказ ${result.code}: ${result.message}`);
  }
  return result;
}

const FIELD = OPEN_FIELD;

/** Число существ в первый день недель 2–5. */
function growthOf(count: number): number[] {
  let state = gameWith(FIELD, [guard(6, 3, count)]);
  const counts: number[] = [];
  for (let day = 2; day <= 29; day += 1) {
    ({ state } = accepted(state, { type: "endTurn", player: 0 }));
    const [object] = state.objects;
    if (day % 7 === 1 && object?.type === "guard") {
      counts.push(object.count);
    }
  }
  return counts;
}

describe("слово о численности", () => {
  it.each([
    [1, "горстка"],
    [4, "горстка"],
    [5, "несколько"],
    [9, "несколько"],
    [10, "группа"],
    [19, "группа"],
    [20, "много"],
    [49, "много"],
    [50, "орда"],
    [99, "орда"],
    [100, "толпа"],
    [249, "толпа"],
    [250, "полчище"],
    [499, "полчище"],
    [500, "тьма"],
    [999, "тьма"],
    [1000, "легион"],
    [4000, "легион"],
  ])("%i существ — %s", (count, word) => {
    expect(quantityWord(count)).toBe(word);
  });
});

describe("недельный рост", () => {
  it.each([
    [1, [1, 1, 1, 1]],
    [5, [5, 6, 6, 7]],
    [9, [9, 10, 11, 13]],
    [10, [11, 12, 13, 14]],
    [15, [16, 18, 19, 21]],
    [25, [27, 30, 33, 36]],
    [100, [110, 121, 133, 146]],
    [3990, [4000, 4000, 4000, 4000]],
  ])("было %i — через одну, две, три, четыре недели %j", (count, expected) => {
    expect(growthOf(count)).toEqual(expected);
  });

  it("растёт только в первый день недели, начиная со второй; событие называет было и стало", () => {
    let state = gameWith(FIELD, [guard(6, 3, 10)]);
    const lines: string[] = [];
    for (let day = 2; day <= 8; day += 1) {
      const result = accepted(state, { type: "endTurn", player: 0 });
      ({ state } = result);
      const grew = result.events.filter((event) => event.type === "guardGrew");
      expect(grew.length).toBe(day === 8 ? 1 : 0);
      lines.push(...grew.map(formatEvent));
    }
    expect(lines).toEqual(["Охранник o1 вырос: было 10, стало 11"]);
    expect(state.objects[0]).toMatchObject({ count: 11, power: 11_000 });
  });
});

describe("зона охранника и начало боя", () => {
  it("шаг в зону останавливает героя и начинает бой, даже если путь вёл дальше", () => {
    const state = gameWith(FIELD, [guard(4, 0)]);
    const result = accepted(state, move(["E", "E", "E", "SE", "E"]));
    // Клетка (3, 0) — соседняя с охранником: герой встал там и дальше не пошёл.
    expect(result.state.heroes[0]).toMatchObject({ x: 3, y: 0, movement: 700 });
    expect(result.state.battle).toMatchObject({ heroId: "A", guardId: "o1" });
    expect(result.events.map(formatEvent).slice(0, 4)).toEqual([
      "Герой A: шаг (0, 0) → (1, 0), потрачено 100, осталось 900",
      "Герой A: шаг (1, 0) → (2, 0), потрачено 100, осталось 800",
      "Герой A: шаг (2, 0) → (3, 0), потрачено 100, осталось 700",
      "Начался бой: герой A против охранника o1",
    ]);
  });

  it("зона — все восемь соседних клеток, в том числе по диагонали; дальше зоны боя нет", () => {
    const state = gameWith(FIELD, [guard(4, 2)]);
    const zone = [
      [3, 1],
      [4, 1],
      [5, 1],
      [3, 2],
      [5, 2],
      [3, 3],
      [4, 3],
      [5, 3],
    ] as const;
    for (const [x, y] of zone) {
      // Герой стоит за клеткой зоны, на той же линии от охранника, и делает один шаг к нему.
      const from = placeHero(state, 4 + 2 * (x - 4), 2 + 2 * (y - 2));
      const path = findPath(from, "A", { x, y });
      const steps = path.found ? [...path.steps] : [];
      expect(steps).toHaveLength(1);
      const result = accepted(from, move(steps));
      expect(result.state.heroes[0]).toMatchObject({ x, y });
      expect(result.state.battle?.guardId).toBe("o1");
    }
    // В двух клетках от охранника боя нет.
    expect(accepted(state, move(["E", "E"])).state.battle).toBeNull();
  });

  it("очков хватило дойти до зоны ровно: бой начинается, остаток ноль", () => {
    const state = placeHero(gameWith(FIELD, [guard(4, 0)]), 0, 0, 300);
    const result = accepted(state, move(["E", "E", "E"]));
    expect(result.state.heroes[0]).toMatchObject({ x: 3, y: 0, movement: 0 });
    expect(result.state.battle).not.toBeNull();
  });

  it("герой рядом с охранником нападает шагом на его клетку: не двигается, очки тратит", () => {
    const state = placeHero(gameWith(FIELD, [guard(4, 0), guard(4, 2)]), 3, 1);
    // Нападает на того, на чью клетку шагнул, а не на первого по списку.
    const result = accepted(state, move(["SE"]));
    expect(result.state.heroes[0]).toMatchObject({ x: 3, y: 1, movement: 859 });
    expect(result.state.battle?.guardId).toBe("o2");
    expect(result.events.some((event) => event.type === "heroStepped")).toBe(false);
  });

  it("не хватает очков на шаг к охраннику — боя нет", () => {
    const state = placeHero(gameWith(FIELD, [guard(4, 0)]), 3, 0, 99);
    expect(applyCommand(state, move(["E"]))).toMatchObject({ code: "NOT_ENOUGH_MOVEMENT" });
  });

  it("клетка в зоне двух охранников: дерётся тот, что раньше в списке объектов", () => {
    const state = gameWith(FIELD, [guard(5, 3), guard(5, 1)]);
    const result = accepted(placeHero(state, 2, 2), move(["E", "E"]));
    expect(result.state.heroes[0]).toMatchObject({ x: 4, y: 2 });
    expect(result.state.battle?.guardId).toBe("o1");
  });

  it("герой, уже стоящий в зоне, может уйти; шаг в зону снова начинает бой", () => {
    const state = placeHero(gameWith(FIELD, [guard(4, 0)]), 3, 0);
    expect(accepted(state, move(["W"])).state.battle).toBeNull();
    expect(accepted(state, move(["S"])).state.battle?.guardId).toBe("o1");
  });

  it("сквозь клетку охранника пройти нельзя; кучка в зоне подбирается без боя", () => {
    const pile: MapObjectDefinition = { type: "pile", x: 3, y: 0, resource: "wood", amount: 7 };
    const state = gameWith(FIELD, [guard(4, 0), pile]);
    const near = placeHero(state, 3, 1);
    expect(applyCommand(near, move(["NE", "E"]))).toMatchObject({ code: "STEP_BLOCKED" });
    // Герой стоит в (2, 0), вне зоны; кучка в зоне, но герой на её клетку не встаёт.
    const picked = accepted(placeHero(state, 2, 0), move(["E"]));
    expect(picked.state.battle).toBeNull();
    expect(picked.state.players[0]?.resources.wood).toBe(7);
  });

  it("шахту в зоне охранника герой при входе не занимает", () => {
    const mine: MapObjectDefinition = { type: "mine", x: 3, y: 0, kind: "sawmill" };
    const result = accepted(gameWith(FIELD, [guard(4, 0), mine]), move(["E", "E", "E"]));
    expect(result.state.battle).not.toBeNull();
    expect(result.state.objects[1]).toMatchObject({ owner: null });
    expect(result.events.some((event) => event.type === "mineCaptured")).toBe(false);
  });
});

describe("поиск пути и охранники", () => {
  const state = gameWith(FIELD, [guard(4, 0)]);

  it("клетка зоны — только конец пути: дальше путь идёт в обход зоны", () => {
    expect(findPath(state, "A", { x: 3, y: 0 })).toMatchObject({ steps: ["E", "E", "E"] });
    // До (6, 0) напрямую 600, но зона закрыта: обход через третий ряд — 3 × 141 + 4 × 100.
    const around = findPath(state, "A", { x: 6, y: 0 });
    expect(around).toMatchObject({ found: true, cost: 823 });
    // Ни одна клетка пути, кроме последней, не лежит в зоне.
    const cells = cellsAlong({ x: 0, y: 0 }, around.found ? around.steps : []).slice(0, -1);
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      expect(Math.max(Math.abs(cell.x - 4), Math.abs(cell.y))).toBeGreaterThan(1);
    }
  });

  it("путь к охраннику издалека кончается на ближайшей клетке его зоны", () => {
    const path = findPath(state, "A", { x: 4, y: 0 });
    expect(path).toMatchObject({ found: true, steps: ["E", "E", "E"], cost: 300 });
  });

  it("путь к охраннику с соседней клетки — один шаг на его клетку", () => {
    const near = placeHero(state, 3, 1);
    expect(findPath(near, "A", { x: 4, y: 0 })).toMatchObject({ steps: ["NE"], cost: 141 });
  });

  it("найденный путь команда перемещения принимает", () => {
    for (const target of [
      { x: 6, y: 0 },
      { x: 4, y: 0 },
      { x: 5, y: 1 },
      { x: 7, y: 4 },
    ]) {
      const path = findPath(state, "A", target);
      const steps = path.found ? [...path.steps] : [];
      expect(applyCommand(state, move(steps))).toMatchObject({ ok: true });
    }
  });
});

describe("охранник в файле карты и в выводе", () => {
  const base = {
    id: "t",
    name: "t",
    terrain: Array.from({ length: 8 }, () => "........"),
    players: [{ hero: { x: 1, y: 1, army: TEST_ARMY } }],
  };

  function fieldsOf(objects: MapObjectDefinition[]): string[] {
    return validateMap({ ...base, objects }, CREATURES).map((error) => error.field);
  }

  it("карта отвергается: неизвестное существо, число вне 1–4000, герой рядом с охранником", () => {
    expect(fieldsOf([guard(5, 5)])).toEqual([]);
    expect(fieldsOf([guard(5, 5, 15, "dragon")])).toEqual(["objects.0"]);
    expect(fieldsOf([guard(5, 5, 0)])).toEqual(["objects.0"]);
    expect(fieldsOf([guard(5, 5, 4001)])).toEqual(["objects.0"]);
    expect(fieldsOf([guard(5, 5, 4000)])).toEqual([]);
    expect(fieldsOf([guard(2, 2)])).toEqual(["objects.0"]);
    expect(fieldsOf([guard(3, 1)])).toEqual([]);
  });

  it("карта отвергается: армии нет, отрядов больше семи, неизвестное существо, число меньше 1", () => {
    const withArmy = (army: { creature: string; count: number }[]) =>
      validateMap({ ...base, players: [{ hero: { x: 1, y: 1, army } }] }, CREATURES).map(
        (error) => error.field,
      );
    const one = { creature: "militia", count: 1 };
    expect(withArmy([])).toEqual(["players.0.hero.army"]);
    expect(withArmy(Array.from({ length: 7 }, () => one))).toEqual([]);
    expect(withArmy(Array.from({ length: 8 }, () => one))).toEqual(["players.0.hero.army"]);
    expect(withArmy([{ creature: "dragon", count: 3 }])).toEqual([
      "players.0.hero.army.0.creature",
    ]);
    expect(withArmy([{ creature: "militia", count: 0 }])).toEqual(["players.0.hero.army.0.count"]);
    const negative = { ...base, players: [{ hero: { x: 1, y: 1, attack: -1, army: [one] } }] };
    expect(validateMap(negative, CREATURES).map((error) => error.field)).toEqual([
      "players.0.hero",
    ]);
  });

  it("в выводе охранник — G, в списке — существо, слово и точное число", () => {
    const lines = renderState(gameWith(FIELD, [guard(4, 0, 15)])).split("\n");
    expect(lines[5]).toBe(" 0 A...G...");
    expect(lines).toContain("o1 (4, 0): охранник, Ополченец, группа (15)");
  });
});
