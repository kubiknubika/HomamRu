// Свойства из разделов «Свойства, верные всегда» спецификаций 40-two-players.md и
// 41-victory.md на случайных партиях: два игрока ходят куда попало, дерутся, берут города,
// заканчивают дни. Случайность — от генератора ядра с сидом, поэтому тест при каждом запуске
// одинаков. До этой порции свойства двух игроков и победы автоматикой не проверялись вовсе.
import { describe, expect, it } from "vitest";
import { chooseBattleCommand } from "./battle/ai.ts";
import { applyCommand } from "./commands.ts";
import { duel, end, enemyTown, HOME, move } from "./duelKit.ts";
import type { Direction } from "./types.ts";
import { findPath } from "./pathfinding.ts";
import { createRng, nextInt } from "./rng.ts";
import type { RngState as Rng } from "./rng.ts";
import type { Command, GameState } from "./types.ts";

const GAMES = 40;
const COMMANDS = 120;
const SIZE = 8;
const DIRS: readonly Direction[] = ["N", "S", "W", "E"];

/**
 * Случайная партия на двоих: у каждого свой город, между ними преграды и чужой город.
 * Герой B — компьютер, поэтому ходит сам, но мы дёргаем и его команды напрямую.
 */
function randomDuel(seed: number): GameState {
  let rng = createRng(seed);
  const rows: string[] = [];
  for (let y = 0; y < SIZE; y += 1) {
    let row = "";
    for (let x = 0; x < SIZE; x += 1) {
      const born = nextInt(rng, 0, 19);
      ({ rng } = born);
      const busy = (x === 0 && y === 0) || (x === 4 && y === 0) || (x === 0 && y === 4);
      row += !busy && born.value < 4 ? "#" : ".";
    }
    rows.push(row);
  }
  const state = duel([HOME, enemyTown([{ creature: "militia", count: 12 }])]);
  return { ...state, map: { ...state.map, terrain: rows } };
}

/** Случайная команда: в бою — ход компьютера, на карте — шаг к случайной клетке или конец дня. */
function randomCommand(state: GameState, rng: Rng): { command: Command; rng: Rng } {
  if (state.outcome !== null) {
    return { command: end(0), rng };
  }
  if (state.battle !== null) {
    const command = chooseBattleCommand(state.battle.state) ?? { type: "battleWait", side: 0 };
    return { command, rng };
  }
  const kind = nextInt(rng, 0, 9);
  const player = state.currentPlayer;
  if (kind.value < 3) {
    return { command: end(player), rng: kind.rng };
  }
  const hero = state.heroes.find((candidate) => candidate.owner === player);
  if (hero === undefined) {
    return { command: end(player), rng: kind.rng };
  }
  const x = nextInt(kind.rng, 0, SIZE - 1);
  const y = nextInt(x.rng, 0, SIZE - 1);
  const path = findPath(state, hero.id, { x: x.value, y: y.value });
  if (path.found && path.steps.length > 0) {
    return {
      command: { type: "moveHero", player, heroId: hero.id, path: [...path.steps] },
      rng: y.rng,
    };
  }
  // Путь не найден — шагаем наугад в соседнюю клетку, чтобы проверить и отказы.
  const dir = DIRS[nextInt(y.rng, 0, DIRS.length - 1).value] ?? "N";
  const move2 = nextInt(y.rng, 0, 0);
  return { command: move(player, dir), rng: move2.rng };
}

/** Нарушенные свойства 40 и 41; после любой команды список пуст. */
function violations(state: GameState): string[] {
  const broken: string[] = [];
  const check = (holds: boolean, text: string): void => {
    if (!holds) {
      broken.push(text);
    }
  };

  // 40: на одной клетке не бывает двух героев разных игроков.
  const cells = new Map<string, number>();
  for (const hero of state.heroes) {
    const cell = `${hero.x},${hero.y}`;
    const seen = cells.get(cell);
    check(seen === undefined || seen === hero.owner, "два героя разных игроков на одной клетке");
    cells.set(cell, hero.owner);
  }

  const towns = state.objects.filter((object) => object.type === "town");
  for (const town of towns) {
    if (town.type !== "town") {
      continue;
    }
    // 40: в городе стоит только герой его владельца.
    for (const hero of state.heroes) {
      if (hero.x === town.x && hero.y === town.y) {
        check(hero.owner === town.owner, "в чужом городе стоит герой");
      }
    }
    // 41: у играющего игрока с городом не бывает счётчика дней без города.
    const owner = state.players[town.owner];
    check(owner === undefined || owner.townlessDays === null, "у игрока с городом идёт отсчёт");
  }

  // 41: счётчик есть только у игрока без города, и он меньше 7.
  for (const player of state.players) {
    if (player.eliminated) {
      continue;
    }
    const hasTown = towns.some((town) => town.type === "town" && town.owner === player.id);
    const hasHero = state.heroes.some((hero) => hero.owner === player.id);
    // 41: пока партия идёт, у каждого играющего есть город или герой.
    if (state.outcome === null) {
      check(hasTown || hasHero, `игрок ${player.id} без города и без героя, а партия идёт`);
    }
    if (player.townlessDays !== null) {
      check(!hasTown, `у игрока ${player.id} счётчик, хотя город есть`);
      check(player.townlessDays < 7, `у игрока ${player.id} счётчик ${player.townlessDays}`);
    }
  }

  // 41: победитель не выбывал.
  if (state.winner !== null) {
    const winner = state.players[state.winner];
    check(winner?.eliminated !== true, "победитель выбывал");
  }

  return broken;
}

describe("свойства двух игроков и победы (40, 41)", () => {
  it("на случайных партиях свойства держатся после каждой команды", () => {
    const broken: string[] = [];
    for (let seed = 1; seed <= GAMES; seed += 1) {
      let state = randomDuel(seed);
      let rng = createRng(seed * 7919);
      for (let step = 0; step < COMMANDS; step += 1) {
        const rolled = randomCommand(state, rng);
        rng = rolled.rng;
        const result = applyCommand(state, rolled.command);
        // Отказ — законный исход: команда могла быть неверной. Свойства проверяем только
        // на принятых: после отказа состояние не меняется вовсе.
        if (!result.ok) {
          broken.push(...violations(state).map((text) => `сид ${seed}, шаг ${step}: ${text}`));
          continue;
        }
        state = result.state;
        broken.push(...violations(state).map((text) => `сид ${seed}, шаг ${step}: ${text}`));
        if (state.outcome !== null) {
          break;
        }
      }
    }
    expect([...new Set(broken)].slice(0, 5)).toEqual([]);
  });
});
