import { CREATURES } from "./battle/testkit.ts";
import { BUILDINGS } from "./testkit.ts";
import { TEST_ARMY } from "./testkit.ts";
import { describe, expect, it } from "vitest";
import { applyCommand } from "./commands.ts";
import { createGame } from "./game.ts";
import { validateMap } from "./map.ts";
import { incomeOf, objectAt } from "./objects.ts";
import { findPath } from "./pathfinding.ts";
import { formatEvent, renderState } from "./render.ts";
import type { Command, Direction, GameState, MapDefinition, MapObjectDefinition } from "./types.ts";

const TERRAIN = Array.from({ length: 8 }, () => "........");

function mapOf(objects: MapObjectDefinition[], players = 1): MapDefinition {
  return {
    id: "t",
    name: "t",
    terrain: TERRAIN,
    players: [
      { hero: { x: 1, y: 1, army: TEST_ARMY }, resources: { gold: 100 } },
      { hero: { x: 6, y: 6, army: TEST_ARMY } },
    ].slice(0, players),
    objects,
  };
}

function start(objects: MapObjectDefinition[], seed = 1, players = 1): GameState {
  const created = createGame(mapOf(objects, players), seed, CREATURES, BUILDINGS);
  if (!created.ok) {
    throw new Error("партия не создана");
  }
  return created.state;
}

/** Применяет команды; каждая должна быть принята. Возвращает состояние и все события. */
function play(state: GameState, commands: Command[]) {
  let current = state;
  const lines: string[] = [];
  for (const command of commands) {
    const result = applyCommand(current, command);
    if (!result.ok) {
      throw new Error(`отказ ${result.code}`);
    }
    current = result.state;
    lines.push(...result.events.map(formatEvent));
  }
  return { state: current, lines };
}

function move(path: Direction[], player = 0): Command {
  return { type: "moveHero", player, heroId: player === 0 ? "A" : "B", path };
}

const END: Command = { type: "endTurn", player: 0 };

describe("создание партии с объектами — 20-map-objects.md", () => {
  it("объекты получают идентификаторы по порядку, запас — из файла карты", () => {
    const state = start([
      { type: "pile", x: 3, y: 1, resource: "wood", amount: 8 },
      { type: "mine", x: 5, y: 5, kind: "sawmill" },
    ]);
    expect(state.objects).toEqual([
      { id: "o1", type: "pile", x: 3, y: 1, resource: "wood", amount: 8 },
      { id: "o2", type: "mine", x: 5, y: 5, kind: "sawmill", owner: null },
    ]);
    expect(state.players[0]?.resources).toEqual({ gold: 100, wood: 0, ore: 0 });
  });

  it("кучка без количества: золото 500–1000 сотнями, дерево и руда 5–10; от сида зависит", () => {
    const seen = { gold: new Set<number>(), wood: new Set<number>(), ore: new Set<number>() };
    for (let seed = 1; seed <= 300; seed += 1) {
      const state = start(
        [
          { type: "pile", x: 3, y: 1, resource: "gold" },
          { type: "pile", x: 4, y: 1, resource: "wood" },
          { type: "pile", x: 5, y: 1, resource: "ore" },
        ],
        seed,
      );
      for (const object of state.objects) {
        if (object.type === "pile") {
          seen[object.resource].add(object.amount);
        }
      }
    }
    expect([...seen.gold].toSorted((a, b) => a - b)).toEqual([500, 600, 700, 800, 900, 1000]);
    expect([...seen.wood].toSorted((a, b) => a - b)).toEqual([5, 6, 7, 8, 9, 10]);
    expect([...seen.ore].toSorted((a, b) => a - b)).toEqual([5, 6, 7, 8, 9, 10]);
    // Один сид — одна и та же партия.
    const objects: MapObjectDefinition[] = [{ type: "pile", x: 3, y: 1, resource: "gold" }];
    expect(start(objects, 7)).toEqual(start(objects, 7));
  });

  it("карта отвергается: объект вне карты, на преграде, в занятой клетке, с неверным числом", () => {
    const base = mapOf([]);
    const terrain = ["..#.....", ...TERRAIN.slice(1)];
    const errorsOf = (objects: MapObjectDefinition[], rows = TERRAIN) =>
      validateMap({ ...base, terrain: rows, objects }, CREATURES).map((error) => error.field);
    expect(errorsOf([{ type: "pile", x: 8, y: 0, resource: "gold" }])).toEqual(["objects.0"]);
    expect(errorsOf([{ type: "mine", x: 2, y: 0, kind: "ore-pit" }], terrain)).toEqual([
      "objects.0",
    ]);
    expect(errorsOf([{ type: "mine", x: 1, y: 1, kind: "ore-pit" }])).toEqual(["objects.0"]);
    expect(
      errorsOf([
        { type: "pile", x: 3, y: 3, resource: "gold" },
        { type: "mine", x: 3, y: 3, kind: "ore-pit" },
      ]),
    ).toEqual(["objects.1"]);
    expect(errorsOf([{ type: "pile", x: 3, y: 3, resource: "gold", amount: 0 }])).toEqual([
      "objects.0",
    ]);
    const negative = {
      ...base,
      players: [{ hero: { x: 1, y: 1, army: TEST_ARMY }, resources: { wood: -1 } }],
    };
    expect(validateMap(negative, CREATURES).map((error) => error.field)).toEqual([
      "players.0.resources.wood",
    ]);
  });
});

describe("кучка ресурсов", () => {
  const PILE: MapObjectDefinition[] = [{ type: "pile", x: 3, y: 1, resource: "wood", amount: 8 }];

  it("подбирается с соседней клетки: герой не встаёт на неё, очки за шаг тратятся", () => {
    const { state, lines } = play(start(PILE), [move(["E", "E"])]);
    expect(state.heroes[0]).toMatchObject({ x: 2, y: 1, movement: 800 });
    expect(state.objects).toEqual([]);
    expect(state.players[0]?.resources).toEqual({ gold: 100, wood: 8, ore: 0 });
    expect(lines).toEqual([
      "Герой A: шаг (1, 1) → (2, 1), потрачено 100, осталось 900",
      "Игрок 1 подобрал кучку o1: дерево +8",
    ]);
    // Клетка освободилась: теперь на неё можно встать.
    expect(play(state, [move(["E"])]).state.heroes[0]).toMatchObject({ x: 3, y: 1 });
  });

  it("по диагонали шаг к кучке стоит 141", () => {
    const state = start([{ type: "pile", x: 2, y: 2, resource: "ore", amount: 5 }]);
    expect(play(state, [move(["SE"])]).state.heroes[0]).toMatchObject({
      x: 1,
      y: 1,
      movement: 859,
    });
  });

  it("сквозь кучку пройти нельзя; без очков на последний шаг кучка остаётся", () => {
    const state = start(PILE);
    expect(applyCommand(state, move(["E", "E", "E"]))).toMatchObject({ code: "STEP_BLOCKED" });
    const tired = { ...state, heroes: state.heroes.map((hero) => ({ ...hero, movement: 150 })) };
    expect(applyCommand(tired, move(["E", "E"]))).toMatchObject({ code: "NOT_ENOUGH_MOVEMENT" });
    expect(objectAt(tired, 3, 1)).toBeDefined();
  });

  it("поиск пути: кучка — конец пути, сквозь неё путь не идёт", () => {
    const state = start(PILE);
    expect(findPath(state, "A", { x: 3, y: 1 })).toMatchObject({ steps: ["E", "E"], cost: 200 });
    // До клетки за кучкой — в обход, а не насквозь.
    const beyond = findPath(state, "A", { x: 4, y: 1 });
    // Прямо, по диагонали вниз, по диагонали вверх: 100 + 141 + 141.
    expect(beyond).toMatchObject({ found: true, cost: 382 });
  });
});

describe("шахта", () => {
  const MINES: MapObjectDefinition[] = [
    { type: "mine", x: 3, y: 1, kind: "sawmill" },
    { type: "mine", x: 3, y: 3, kind: "gold-mine" },
    { type: "mine", x: 1, y: 3, kind: "ore-pit" },
  ];

  it("герой, вставший на шахту, занимает её; доход идёт со следующего дня", () => {
    const taken = play(start(MINES), [move(["E", "E"])]);
    expect(taken.state.heroes[0]).toMatchObject({ x: 3, y: 1 });
    expect(taken.state.objects[0]).toMatchObject({ owner: 0 });
    expect(taken.lines.at(-1)).toBe("Игрок 1 занял шахту o1 (была ничья)");
    expect(taken.state.players[0]?.resources.wood).toBe(0);
    const next = play(taken.state, [END]);
    expect(next.state.players[0]?.resources).toEqual({ gold: 100, wood: 2, ore: 0 });
    expect(next.lines.at(-1)).toBe("Игрок 1 получил доход: дерево +2");
    expect(play(next.state, [END, END]).state.players[0]?.resources.wood).toBe(6);
  });

  it("доход по видам шахт: лесопилка 2 дерева, рудник 2 руды, золотая шахта 1000 золота", () => {
    const state = start(MINES);
    const owned = {
      ...state,
      objects: state.objects.map((object) => ({ ...object, owner: 0 })),
    } as GameState;
    expect(incomeOf(owned, 0)).toEqual({ gold: 1000, wood: 2, ore: 2 });
    expect(incomeOf(state, 0)).toEqual({ gold: 0, wood: 0, ore: 0 });
    const { state: after, lines } = play(owned, [END]);
    expect(after.players[0]?.resources).toEqual({ gold: 1100, wood: 2, ore: 2 });
    expect(lines.at(-1)).toBe("Игрок 1 получил доход: золото +1000, дерево +2, руда +2");
  });

  it("сквозь шахту пройти нельзя, сойти с неё можно; своя шахта второй раз не занимается", () => {
    const state = start(MINES);
    expect(applyCommand(state, move(["E", "E", "E"]))).toMatchObject({ code: "STEP_BLOCKED" });
    const onMine = play(state, [move(["E", "E"])]).state;
    const back = play(onMine, [move(["E"]), move(["W"])]);
    expect(back.state.heroes[0]).toMatchObject({ x: 3, y: 1 });
    expect(back.lines.filter((line) => line.includes("занял"))).toEqual([]);
    // Путь с шахты строится; путь сквозь другую шахту — нет.
    expect(findPath(onMine, "A", { x: 5, y: 1 })).toMatchObject({ steps: ["E", "E"] });
    expect(findPath(onMine, "A", { x: 3, y: 3 })).toMatchObject({ found: true });
    // В обход шахты: 100 + 141 + 100 + 141.
    expect(findPath(state, "A", { x: 5, y: 1 })).toMatchObject({ found: true, cost: 482 });
  });

  it("шахту можно отобрать: доход переходит новому владельцу в его ход", () => {
    const state = start([{ type: "mine", x: 3, y: 1, kind: "sawmill" }], 1, 2);
    const mine = state.objects.map((object) => ({ ...object, owner: 1 })) as GameState["objects"];
    const { state: after, lines } = play({ ...state, objects: mine }, [move(["E", "E"])]);
    expect(after.objects[0]).toMatchObject({ owner: 0 });
    expect(lines.at(-1)).toBe("Игрок 1 занял шахту o1 (была игрока 2)");
    // День 1: дохода нет ни у кого. День 2: доход только у нового владельца.
    const second = play(after, [END, { type: "endTurn", player: 1 }]);
    expect(second.state.players.map((player) => player.resources.wood)).toEqual([2, 0]);
  });
});

describe("текстовый вывод объектов", () => {
  it("объекты показаны символами, под картой — список и запас", () => {
    const state = start([
      { type: "pile", x: 3, y: 0, resource: "gold", amount: 700 },
      { type: "pile", x: 4, y: 0, resource: "wood", amount: 8 },
      { type: "pile", x: 5, y: 0, resource: "ore", amount: 6 },
      { type: "mine", x: 6, y: 0, kind: "gold-mine" },
    ]);
    const lines = renderState(state).split("\n");
    expect(lines[5]).toBe(" 0 ...$woM.");
    expect(lines.slice(-6)).toEqual([
      "",
      "o1 (3, 0): кучка, золото 700",
      "o2 (4, 0): кучка, дерево 8",
      "o3 (5, 0): кучка, руда 6",
      "o4 (6, 0): золотая шахта, ничья, в день золото +1000",
      "Игрок 1: золото 100, дерево 0, руда 0.",
    ]);
  });
});
