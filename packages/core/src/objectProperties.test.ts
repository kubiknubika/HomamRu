// Свойства из раздела «Свойства, верные всегда» спецификации 20-map-objects.md:
// проверяются на случайных партиях. Случайность — от генератора ядра с сидом,
// поэтому тест при каждом запуске одинаков.
import { playBattleOut } from "./battleAuto.ts";
import { CONTENT, TEST_ARMY } from "./testkit.ts";
import { describe, expect, it } from "vitest";
import { applyCommand } from "./commands.ts";
import { createGame } from "./game.ts";
import { findPath } from "./pathfinding.ts";
import { createRng, nextInt } from "./rng.ts";
import { MINE_KINDS, RESOURCES } from "./types.ts";
import type { Command, GameEvent, GameState, MapObjectDefinition, Resource } from "./types.ts";

const GAMES = 60;
const COMMANDS = 80;
const SIZE = 9;

/** Случайная партия: два героя в углах, преграды и объекты на остальных клетках. */
function randomGame(seed: number): GameState {
  let rng = createRng(seed);
  const rows: string[] = [];
  const objects: MapObjectDefinition[] = [];
  for (let y = 0; y < SIZE; y += 1) {
    let row = "";
    for (let x = 0; x < SIZE; x += 1) {
      const roll = nextInt(rng, 0, 11);
      ({ rng } = roll);
      const corner = (x === 0 && y === 0) || (x === SIZE - 1 && y === SIZE - 1);
      row += !corner && roll.value < 2 ? "#" : ".";
      if (!corner && roll.value === 2) {
        objects.push({ type: "pile", x, y, resource: RESOURCES[(x + y) % 3] ?? "gold" });
      }
      if (!corner && roll.value === 3) {
        objects.push({ type: "mine", x, y, kind: MINE_KINDS[(x + y) % 3] ?? "sawmill" });
      }
    }
    rows.push(row);
  }
  const corners = [
    { hero: { x: 0, y: 0, army: TEST_ARMY } },
    { hero: { x: SIZE - 1, y: SIZE - 1, army: TEST_ARMY } },
  ];
  const created = createGame(
    { id: "r", name: "r", terrain: rows, players: corners, objects },
    seed,
    CONTENT,
  );
  if (!created.ok) {
    throw new Error("случайная карта отвергнута");
  }
  return created.state;
}

/** Что событие прибавило игроку: только подбор кучки и доход меняют запас. */
function gainOf(event: GameEvent, player: number, resource: Resource): number {
  if (event.type === "pilePicked" && event.player === player && event.resource === resource) {
    return event.amount;
  }
  if (event.type === "incomeReceived" && event.player === player) {
    return event.income[resource];
  }
  return 0;
}

describe("свойства объектов карты на случайных партиях", () => {
  it("запас меняется только событиями; кучка подбирается один раз; найденный путь принимается", () => {
    let picked = 0;
    let captured = 0;
    for (let seed = 1; seed <= GAMES; seed += 1) {
      let state = randomGame(seed);
      let rng = createRng(seed + 1000);
      const pickedIds = new Set<string>();
      for (let step = 0; step < COMMANDS; step += 1) {
        const player = state.currentPlayer;
        const hero = state.heroes.find((candidate) => candidate.owner === player);
        const rollX = nextInt(rng, 0, SIZE - 1);
        const rollY = nextInt(rollX.rng, 0, SIZE - 1);
        ({ rng } = rollY);
        const path = findPath(state, hero?.id ?? "", { x: rollX.value, y: rollY.value });
        const affordable =
          path.found && path.steps.length > 0 && path.cost <= (hero?.movement ?? 0);
        const command: Command = affordable
          ? { type: "moveHero", player, heroId: hero?.id ?? "", path: [...path.steps] }
          : { type: "endTurn", player };
        const result = applyCommand(state, command);
        if (!result.ok) {
          throw new Error(`сид ${seed}, шаг ${step}: отказ ${result.code}: ${result.message}`);
        }
        const pickedNow = result.events.flatMap((event) =>
          event.type === "pilePicked" ? [event.objectId] : [],
        );
        expect(pickedNow.filter((id) => pickedIds.has(id))).toEqual([]);
        pickedNow.forEach((id) => pickedIds.add(id));
        picked += pickedNow.length;
        captured += result.events.filter((event) => event.type === "mineCaptured").length;
        for (const [id, before] of state.players.entries()) {
          for (const resource of RESOURCES) {
            const gain = result.events.reduce((sum, event) => sum + gainOf(event, id, resource), 0);
            const after = result.state.players[id]?.resources[resource];
            expect(after).toBe(before.resources[resource] + gain);
            expect(after).toBeGreaterThanOrEqual(0);
          }
        }
        // Герои встретились — бой доигрывает компьютер; запас игроков бой не меняет.
        state = playBattleOut(result.state).state;
        if (state.outcome !== null) {
          break;
        }
        // Подобранных кучек в списке нет; герой не стоит на клетке кучки.
        for (const object of state.objects) {
          expect(pickedIds.has(object.id)).toBe(false);
          const occupied = state.heroes.some((h) => h.x === object.x && h.y === object.y);
          expect(object.type === "pile" && occupied).toBe(false);
        }
      }
    }
    // Проверка не пустая: в партиях действительно подбирали и занимали.
    expect(picked).toBeGreaterThan(50);
    expect(captured).toBeGreaterThan(50);
  });
});
