// Свойства из разделов «Свойства, верные всегда» спецификаций 02 и 03:
// проверяются на случайных картах. Случайность — от генератора ядра с сидом,
// поэтому тест при каждом запуске одинаков.
import { describe, expect, it } from "vitest";
import { applyCommand } from "./commands.ts";
import { DAILY_MOVEMENT } from "./game.ts";
import { deltaOf, stepCost, terrainAllowsStep } from "./map.ts";
import { findPath } from "./pathfinding.ts";
import { createRng, nextInt } from "./rng.ts";
import type { RngState } from "./rng.ts";
import { fromPicture } from "./testkit.ts";
import { DIRECTIONS } from "./types.ts";
import type { Direction, GameState, Position } from "./types.ts";

const MAPS = 150;
const SIZE = 9;

/** Случайная карта: примерно треть клеток — преграды; герой в углу. */
function randomMap(seed: number): { state: GameState; rng: RngState } {
  let rng = createRng(seed);
  const rows: string[] = [];
  for (let y = 0; y < SIZE; y += 1) {
    let row = "";
    for (let x = 0; x < SIZE; x += 1) {
      const roll = nextInt(rng, 0, 2);
      rng = roll.rng;
      row += x === 0 && y === 0 ? "S" : roll.value === 0 ? "#" : ".";
    }
    rows.push(row);
  }
  return { state: fromPicture(rows).state, rng };
}

/**
 * Стоимость самого дешёвого пути до каждой клетки, посчитанная другим способом:
 * стоимости улучшаются по кругу, пока есть что улучшать.
 */
function slowCosts(state: GameState, from: Position): Map<string, number> {
  const costs = new Map([[`${from.x},${from.y}`, 0]]);
  for (let changed = true; changed;) {
    changed = false;
    for (const [key, cost] of costs) {
      const [x = 0, y = 0] = key.split(",").map(Number);
      for (const direction of DIRECTIONS) {
        const delta = deltaOf(direction);
        if (delta === undefined || !terrainAllowsStep(state.map, x, y, delta)) {
          continue;
        }
        const next = `${x + delta.dx},${y + delta.dy}`;
        const total = cost + stepCost(delta);
        if (total < (costs.get(next) ?? Number.POSITIVE_INFINITY)) {
          costs.set(next, total);
          changed = true;
        }
      }
    }
  }
  return costs;
}

function withMovement(state: GameState, movement: number): GameState {
  return { ...state, heroes: state.heroes.map((hero) => ({ ...hero, movement })) };
}

function move(state: GameState, path: readonly Direction[]) {
  return applyCommand(state, { type: "moveHero", player: 0, heroId: "A", path });
}

/** Заканчивает день и записывает, если день или запас хода оказались неверными. */
function nextDay(previous: GameState, state: GameState, problems: string[]): GameState {
  const ended = applyCommand(state, { type: "endTurn", player: 0 });
  if (!ended.ok) {
    throw new Error(ended.message);
  }
  const rested = ended.state.heroes.every((hero) => hero.movement === DAILY_MOVEMENT);
  if (ended.state.day !== previous.day + 1 || !rested) {
    problems.push(`день ${previous.day}: новый день начался неверно`);
  }
  return ended.state;
}

describe("свойства перемещения на случайных картах", () => {
  it("найденный путь — самый дешёвый, и команда его принимает", () => {
    const problems: string[] = [];
    let reachable = 0;
    let unreachable = 0;
    for (let seed = 1; seed <= MAPS; seed += 1) {
      const { state } = randomMap(seed);
      const expected = slowCosts(state, { x: 0, y: 0 });
      for (let y = 0; y < SIZE; y += 1) {
        for (let x = 0; x < SIZE; x += 1) {
          const found = findPath(state, "A", { x, y });
          const cost = expected.get(`${x},${y}`);
          const where = `карта ${seed}, клетка (${x}, ${y})`;
          if (cost === undefined) {
            unreachable += 1;
            if (found.found) {
              problems.push(`${where}: найден путь в недостижимую клетку`);
            }
            continue;
          }
          reachable += 1;
          if (!found.found || found.cost !== cost) {
            problems.push(`${where}: ожидалась стоимость ${cost}`);
            continue;
          }
          // Запаса хватает ровно на весь путь: команда обязана его принять.
          const moved = move(withMovement(state, cost), found.steps);
          const hero = moved.ok ? moved.state.heroes[0] : undefined;
          const arrived = hero?.x === x && hero.y === y && hero.movement === 0;
          const emptyRejected = !moved.ok && moved.code === "EMPTY_PATH";
          if (found.steps.length === 0 ? !emptyRejected : !arrived) {
            problems.push(`${where}: команда не приняла найденный путь`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
    // Тест не пустой: на картах есть и достижимые, и недостижимые клетки.
    expect(reachable).toBeGreaterThan(1000);
    expect(unreachable).toBeGreaterThan(1000);
  });

  it("при случайных командах остаток не отрицателен, а отказ ничего не меняет", () => {
    const problems: string[] = [];
    let accepted = 0;
    let rejected = 0;
    for (let seed = 1; seed <= MAPS; seed += 1) {
      const random = randomMap(seed);
      let { state, rng } = random;
      for (let turn = 0; turn < 40; turn += 1) {
        const length = nextInt(rng, 0, 4);
        rng = length.rng;
        const path: Direction[] = [];
        for (let i = 0; i < length.value; i += 1) {
          const pick = nextInt(rng, 0, DIRECTIONS.length - 1);
          rng = pick.rng;
          path.push(DIRECTIONS[pick.value] ?? "N");
        }
        const before = JSON.stringify(state);
        const result = move(state, path);
        if (JSON.stringify(state) !== before) {
          problems.push(`карта ${seed}, ход ${turn}: команда изменила переданное состояние`);
        }
        if (!result.ok) {
          rejected += 1;
          continue;
        }
        accepted += 1;
        const hero = result.state.heroes[0];
        const spent = result.events.reduce((sum, e) => sum + ("cost" in e ? e.cost : 0), 0);
        const last = result.events.at(-1);
        const to = last?.type === "heroStepped" ? last.to : undefined;
        const left = (state.heroes[0]?.movement ?? 0) - spent;
        if (hero === undefined || hero.movement < 0 || hero.movement !== left) {
          problems.push(`карта ${seed}, ход ${turn}: неверный остаток запаса хода`);
        }
        if (hero?.x !== to?.x || hero?.y !== to?.y) {
          problems.push(`карта ${seed}, ход ${turn}: герой стоит не в последней клетке пути`);
        }
        state = turn % 8 === 7 ? nextDay(state, result.state, problems) : result.state;
      }
    }
    expect(problems).toEqual([]);
    expect(accepted).toBeGreaterThan(300);
    expect(rejected).toBeGreaterThan(300);
  });
});
