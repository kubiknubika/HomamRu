// Два игрока в файлах и в сохранении: docs/mechanics/40-two-players.md, 41-victory.md, 04-save.md.
import { applyCommand, createGame, playBattleOut } from "@homamru/core";
import type { Command, GameState } from "@homamru/core";
import { CONTENT } from "@homamru/core/testkit";
import { describe, expect, it } from "vitest";
import { parseTestMap, readTestState } from "./testkit.ts";

const MAP = (kind: string) =>
  [
    "id: test",
    "name: Двое",
    `terrain: [${Array.from({ length: 8 }, () => '"........"').join(", ")}]`,
    "players:",
    "  - hero: { x: 3, y: 3, army: [{ creature: militia, count: 100 }] }",
    "  - hero: { x: 5, y: 3, army: [{ creature: militia, count: 10 }] }",
    `    kind: ${kind}`,
    "objects:",
    "  - { type: town, x: 0, y: 0, owner: 0, buildings: [tavern] }",
    "  - type: town",
    "    x: 4",
    "    y: 4",
    "    owner: 1",
    "    buildings: [tavern]",
    "    garrison: [{ creature: slinger, count: 4 }]",
  ].join("\n");

function start(): GameState {
  const map = parseTestMap("data/maps/test.yaml", MAP("computer"));
  const created = map.ok ? createGame(map.value, 1, CONTENT) : undefined;
  if (created === undefined || !created.ok) {
    throw new Error("карта не разобрана");
  }
  return created.state;
}

function run(state: GameState, command: Command): GameState {
  const result = applyCommand(state, command);
  if (!result.ok) {
    throw new Error(`${command.type}: ${result.code}`);
  }
  return result.state;
}

const move = (...path: ("E" | "SE")[]): Command => ({
  type: "moveHero",
  player: 0,
  heroId: "A",
  path,
});
const saved = (state: GameState) => JSON.parse(JSON.stringify(state)) as unknown;

describe("игроки в файле карты", () => {
  it("вид игрока читается; по умолчанию — человек", () => {
    expect(start().players.map((player) => player.kind)).toEqual(["human", "computer"]);
  });

  it("неизвестный вид игрока — ошибка с названием поля", () => {
    const parsed = parseTestMap("data/maps/test.yaml", MAP("robot"));
    expect(parsed.ok ? [] : parsed.errors.map((error) => error.field)).toEqual(["players.1.kind"]);
  });
});

describe("игроки в сохранении", () => {
  it.each([
    ["с героем", move("E", "E"), { defenderHeroId: "B", townId: null }],
    ["с гарнизоном города", move("SE"), { defenderHeroId: null, townId: "o2" }],
  ] as const)("идущий бой %s загружается без изменений", (_, command, ids) => {
    const fighting = run(start(), command);
    expect(fighting.battle).toMatchObject({ guardId: null, ...ids });
    expect(readTestState(saved(fighting))).toEqual(fighting);
  });

  it("идущий бой с героем в городе загружается: гарнизон уже у героя", () => {
    const placed = start();
    const inTown = {
      ...placed,
      heroes: placed.heroes.map((hero) => (hero.id === "B" ? { ...hero, x: 4, y: 4 } : hero)),
    };
    const fighting = run(inTown, move("SE"));
    expect(fighting.battle).toMatchObject({ defenderHeroId: "B", townId: "o2" });
    expect(readTestState(saved(fighting))).toEqual(fighting);
  });

  it("бой, которого быть не может, из записи убирается", () => {
    const fighting = run(start(), move("E", "E"));
    const broken = { ...fighting, battle: { ...fighting.battle, defenderHeroId: "A" } };
    expect(readTestState(saved(broken as GameState))?.battle).toBeNull();
    const nobody = { ...fighting, battle: { ...fighting.battle, defenderHeroId: null } };
    expect(readTestState(saved(nobody as GameState))?.battle).toBeNull();
  });

  it("отсчёт дней без города и итог партии загружаются без изменений", () => {
    const taken = playBattleOut(run(start(), move("SE"))).state;
    expect(taken.players[1]).toMatchObject({ townlessDays: 0 });
    expect(readTestState(saved(taken))).toEqual(taken);
    const won = playBattleOut(run(taken, { type: "endTurn", player: 0 })).state;
    const over = { ...won, outcome: "victory", winner: 0 } as GameState;
    expect(readTestState(saved(over))).toMatchObject({ outcome: "victory", winner: 0 });
  });

  it("запись, которая спорит с картой, исправляется", () => {
    const state = start();
    const odd = {
      ...state,
      outcome: "victory",
      winner: 1,
      players: [
        // Город есть — отсчёта быть не может.
        { ...state.players[0], townlessDays: 3 },
        // Герой и город есть — игрок не выбыл; значит, и победителя нет.
        { ...state.players[1], eliminated: true, townlessDays: 9, kind: "robot" },
      ],
    };
    const read = readTestState(saved(odd as unknown as GameState));
    expect(read?.players.map((player) => [player.eliminated, player.townlessDays])).toEqual([
      [false, null],
      [false, null],
    ]);
    expect(read?.players[1]?.kind).toBe("human");
    expect(read).toMatchObject({ outcome: "victory", winner: 1 });
  });

  it("победитель, которого нет или который выбыл, — партия считается идущей", () => {
    const state = start();
    const lone = { ...state, outcome: "victory", winner: 5 };
    expect(readTestState(saved(lone as unknown as GameState))).toMatchObject({
      outcome: null,
      winner: null,
    });
  });

  it("в записи до этапа 5 игроки — люди, никто не выбыл", () => {
    const state = start();
    const old = {
      ...state,
      winner: undefined,
      players: state.players.map(({ id, resources, tavern }) => ({ id, resources, tavern })),
    };
    expect(readTestState(saved(old as unknown as GameState))).toEqual({
      ...state,
      players: state.players.map((player) => ({ ...player, kind: "human" })),
    });
  });
});
