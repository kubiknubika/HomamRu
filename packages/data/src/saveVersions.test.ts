// Сохранения других версий: docs/mechanics/04-save.md, раздел «Сохранения других версий».
import { applyCommand, STATE_VERSION } from "@homamru/core";
import { describe, expect, it } from "vitest";
import { encodeSave, verifySave } from "./save.ts";
import {
  decodeTestSave as decodeSave,
  FULL_STATE as FULL,
  readTestState as readState,
  TEST_DEFAULTS,
  TEST_TERRAIN as TERRAIN,
  withChecksumOf,
} from "./testkit.ts";

const NO_RESOURCES = { gold: 0, wood: 0, ore: 0 };

/** Начальные значения параметров героя, появившихся на шаге 3.2. */
const FRESH = {
  kind: "ratibor",
  name: "Ратибор",
  attack: 0,
  defense: 0,
  army: TEST_DEFAULTS.heroArmy,
  experience: 0,
  level: 1,
};

/** Начальные значения параметров состояния, появившихся на шаге 3.2. */
const NO_BATTLES = {
  creatures: TEST_DEFAULTS.creatures,
  buildings: TEST_DEFAULTS.buildings,
  heroKinds: TEST_DEFAULTS.heroes,
  tavern: TEST_DEFAULTS.tavern,
  opponent: TEST_DEFAULTS.opponent,
  battle: null,
  outcome: null,
  winner: null,
};

/** Запись с произвольным содержимым и верной контрольной суммой. */
function saveOf(record: unknown): string {
  return withChecksumOf(JSON.stringify(record));
}

function blankPlayer(id: number) {
  const fate = { kind: "human", eliminated: false, townlessDays: null } as const;
  return { id, ...fate, resources: NO_RESOURCES, tavern: [] };
}

describe("чего в записи нет — берётся начальное значение", () => {
  it("состояние этой версии читается без изменений", () => {
    expect(readState(FULL)).toEqual(FULL);
  });

  it("запись, где есть только местность: всё остальное — из таблицы", () => {
    // Стартовых клеток в записи нет, поэтому герой встаёт на первую клетку земли.
    expect(readState({ map: { terrain: ["#...", "....", "....", "...."] } })).toEqual({
      version: STATE_VERSION,
      rng: { s: 0 },
      map: {
        id: "unknown",
        name: "Без названия",
        width: 4,
        height: 4,
        terrain: ["#...", "....", "....", "...."],
        starts: [],
      },
      players: [blankPlayer(0)],
      heroes: [{ id: "A", owner: 0, x: 1, y: 0, movement: 1000, ...FRESH }],
      objects: [],
      day: 1,
      currentPlayer: 0,
      ...NO_BATTLES,
    });
  });

  it("герой без клетки или вне карты встаёт на стартовую клетку своего игрока", () => {
    const state = readState({
      ...FULL,
      heroes: [
        { id: "A", owner: 0, movement: 500 },
        { id: "B", owner: 1, x: 40, y: 1, movement: 600 },
      ],
    });
    expect(state?.heroes).toEqual([
      { id: "A", owner: 0, x: 0, y: 3, movement: 500, ...FRESH },
      { id: "B", owner: 1, x: 3, y: 0, movement: 600, ...FRESH },
    ]);
  });

  it("списка героев нет — каждому игроку герой на его стартовой клетке", () => {
    for (const heroes of [undefined, [], "герои"]) {
      expect(readState({ ...FULL, heroes })?.heroes).toEqual([
        { id: "A", owner: 0, x: 0, y: 3, movement: 1000, ...FRESH },
        { id: "B", owner: 1, x: 3, y: 0, movement: 1000, ...FRESH },
      ]);
    }
  });

  it("стартовая клетка вне карты или на преграде заменяется первой клеткой земли", () => {
    const map = {
      ...FULL.map,
      starts: [
        { x: 1, y: 1 },
        { x: 9, y: 9 },
        { x: 2, y: 2 },
      ],
    };
    // Лишняя третья клетка убрана: игроков не больше двух.
    expect(readState({ ...FULL, map })?.map.starts).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ]);
  });

  it("сохранение первой версии состояния (без ресурсов и объектов) загружается", () => {
    // Так выглядело состояние до шага 3.1.
    const old = {
      version: 1,
      rng: { s: 42 },
      map: { id: "m", name: "Карта", width: 4, height: 4, terrain: TERRAIN },
      players: [{ id: 0 }, { id: 1 }],
      heroes: [
        { id: "A", owner: 0, x: 0, y: 0, movement: 800 },
        { id: "B", owner: 1, x: 3, y: 3, movement: 1000 },
      ],
      day: 3,
      currentPlayer: 0,
    };
    const commands = [{ type: "endTurn", player: 0 }];
    const text = saveOf({
      format: 1,
      stateVersion: 1,
      seq: 12,
      gameVersion: "0.1.0",
      initial: old,
      commands,
      state: old,
    });
    const state = {
      ...old,
      version: STATE_VERSION,
      map: { ...old.map, starts: [] },
      players: [blankPlayer(0), blankPlayer(1)],
      heroes: old.heroes.map((hero) => ({ ...hero, ...FRESH })),
      objects: [],
      ...NO_BATTLES,
    };
    expect(decodeSave(text)).toEqual({
      kind: "ok",
      // История сброшена: повтор старых команд к дополненному состоянию уже не относится.
      record: { seq: 12, gameVersion: "0.1.0", initial: state, commands: [], state, adapted: true },
    });
  });

  it("нечитаемое значение заменяется начальным", () => {
    const state = readState({
      ...FULL,
      rng: { s: -1 },
      players: [
        {
          id: 5,
          kind: "human",
          eliminated: false,
          townlessDays: null,
          resources: { gold: "много", wood: -2, ore: 1.5 },
        },
        "игрок",
      ],
      heroes: [{ x: 0, y: 0, movement: -5, owner: 9 }, { x: 3, y: 3, id: 7 }, "герой"],
      objects: [{ id: "o3", type: "mine", x: 0, y: 2, kind: "sawmill", owner: 9 }],
      day: 0,
      currentPlayer: 5,
    });
    // Третья запись героя вовсе не читается и убирается.
    expect(state?.heroes).toHaveLength(2);
    expect(state).toMatchObject({
      rng: { s: 0 },
      players: [blankPlayer(0), blankPlayer(1)],
      heroes: [
        { id: "A", owner: 0, x: 0, y: 0, movement: 1000 },
        { id: "B", owner: 1, x: 3, y: 3, movement: 1000 },
      ],
      objects: [{ id: "o3", owner: null }],
      day: 1,
      currentPlayer: 0,
    });
  });

  it("игроков дописывается столько, сколько нужно героям и шахтам", () => {
    const state = readState({
      map: { terrain: TERRAIN },
      heroes: [{ x: 0, y: 0 }],
      objects: [{ id: "o1", type: "mine", x: 2, y: 2, kind: "ore-pit", owner: 1 }],
    });
    expect(state?.players).toEqual([blankPlayer(0), blankPlayer(1)]);
  });
});

describe("чего игра не знает — убирается", () => {
  /** Состояние «из будущего»: незнакомые поля на каждом уровне и незнакомые значения. */
  const future = {
    ...FULL,
    version: 99,
    weather: "rain",
    rng: { ...FULL.rng, stream: 3 },
    map: { ...FULL.map, terrain: ["..~.", ".#..", "..^.", "...."], underground: true },
    players: FULL.players.map((player) => ({
      ...player,
      colour: "red",
      resources: { ...player.resources, gems: 9 },
    })),
    heroes: FULL.heroes.map((hero) => ({ ...hero, spells: ["fireball"] })),
    objects: [
      { ...FULL.objects[0], guardedBy: "dragon" },
      { id: "o2", type: "dragon-lair", x: 1, y: 3 },
      { id: "o9", type: "pile", x: 1, y: 2, resource: "gems", amount: 4 },
      FULL.objects[1],
      { id: "o10", type: "mine", x: 0, y: 2, kind: "sawmill", owner: null },
      { id: "o11", type: "mine", x: 40, y: 2, kind: "sawmill", owner: null },
      { ...FULL.objects[2], mood: "angry" },
      { ...FULL.objects[3], walls: 3 },
    ],
    battle: { round: 3 },
  };

  it("незнакомые поля, объекты и символы местности стираются без ошибки", () => {
    // Незнакомая местность стала обычной землёй: карта та же, что в FULL.
    expect(readState(future)).toEqual(FULL);
  });

  it("запись более новой версии загружается, история сбрасывается", () => {
    const text = saveOf({
      format: 7,
      stateVersion: 99,
      seq: 3,
      gameVersion: "9.0.0",
      cloud: { account: "x" },
      initial: future,
      commands: [{ type: "castSpell", player: 0 }],
      state: future,
    });
    const decoded = decodeSave(text);
    expect(decoded).toMatchObject({
      kind: "ok",
      record: { seq: 3, gameVersion: "9.0.0", commands: [], adapted: true },
    });
    const record = decoded.kind === "ok" ? decoded.record : undefined;
    expect(record?.initial).toEqual(record?.state);
    expect(record?.state).toEqual(readState(future));
  });

  it("после загрузки партия продолжается и сохраняется уже без пометки", () => {
    const loaded = decodeSave(saveOf({ state: future }));
    const record = loaded.kind === "ok" ? loaded.record : undefined;
    expect(record).toMatchObject({ seq: 0, gameVersion: "неизвестно", adapted: true });
    const state = record?.state ?? FULL;
    const command = { type: "endTurn", player: 1 } as const;
    const result = applyCommand(state, command);
    expect(result.ok).toBe(true);
    const next = result.ok ? result.state : state;
    const body = { gameVersion: "test", initial: state, commands: [command], state: next };
    expect(verifySave(body)).toBe(true);
    expect(decodeSave(encodeSave(body, 1))).toEqual({
      kind: "ok",
      record: { ...body, seq: 1, adapted: false },
    });
  });
});

describe("без чего партию не продолжить — сохранение повреждено", () => {
  const cases: [string, unknown][] = [
    ["нет состояния", undefined],
    ["нет карты", { ...FULL, map: undefined }],
    ["нет местности", { ...FULL, map: { id: "m" } }],
    ["пустая местность", { ...FULL, map: { terrain: [] } }],
    ["строки местности разной длины", { ...FULL, map: { terrain: ["....", "..."] } }],
    ["на карте нет ни клетки земли", { ...FULL, map: { terrain: ["##", "##"] } }],
    ["состояние — не объект", "state"],
  ];

  it.each(cases)("%s", (_, state) => {
    expect(readState(state)).toBeNull();
    expect(decodeSave(saveOf({ seq: 1, state }))).toEqual({ kind: "corrupt" });
  });
});
