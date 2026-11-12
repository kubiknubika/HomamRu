// Свойства из разделов «Свойства, верные всегда» спецификаций 21-guards.md, 22-hero.md,
// 23-map-battle.md на случайных партиях: герой ходит куда попало, дерётся, заканчивает дни.
// Случайность — от генератора ядра с сидом, поэтому тест при каждом запуске одинаков.
import { describe, expect, it } from "vitest";
import { chooseBattleCommand } from "./battle/ai.ts";
import { applyCommand, replay } from "./commands.ts";
import { inZone } from "./guards.ts";
import { levelOf } from "./hero.ts";
import { findPath } from "./pathfinding.ts";
import { createRng, nextInt } from "./rng.ts";
import type { RngState as Rng } from "./rng.ts";
import { gameWith } from "./testkit.ts";
import type { Command, GameState, MapObjectDefinition } from "./types.ts";

const GAMES = 60;
const COMMANDS = 150;
const SIZE = 10;
const KINDS = ["militia", "slinger", "falcon"] as const;

/** Случайная партия: герой в углу, преграды, шахты, кучки и охранники разной силы. */
function randomGame(seed: number): GameState {
  let rng = createRng(seed);
  const rows: string[] = [];
  const objects: MapObjectDefinition[] = [];
  for (let y = 0; y < SIZE; y += 1) {
    let row = "";
    for (let x = 0; x < SIZE; x += 1) {
      const roll = nextInt(rng, 0, 19);
      ({ rng } = roll);
      // Угол героя и клетки рядом пусты: карта с охранником вплотную к герою отвергается.
      const free = x > 1 || y > 1;
      row += x === 0 && y === 0 ? "S" : free && roll.value < 3 ? "#" : ".";
      if (free && roll.value === 3) {
        objects.push({ type: "mine", x, y, kind: "sawmill" });
      }
      if (free && roll.value === 4) {
        objects.push({ type: "pile", x, y, resource: "gold" });
      }
      if (free && roll.value >= 5 && roll.value <= 7) {
        // Большинство охранников герою по силам, а самые большие — нет.
        const big = roll.value === 7 && (x + y) % 4 === 0;
        const count = big ? 1500 + x * 200 : 5 + ((x * 7 + y * 3) % 50);
        objects.push({ type: "guard", x, y, creature: KINDS[(x + y) % 3] ?? "militia", count });
      }
    }
    rows.push(row);
  }
  return gameWith(rows, objects, { army: ["militia:200", "slinger:120", "falcon:80"], seed });
}

/** Случайная команда: на карте — путь к случайной клетке или конец дня; в бою — ход компьютера. */
function randomCommand(state: GameState, rng: Rng): { command: Command; rng: Rng } {
  const roll = nextInt(rng, 0, 19);
  if (state.battle !== null) {
    // Изредка герой бежит; изредка команда заведомо неверная.
    const rare = nextInt(roll.rng, 0, 19);
    if (roll.value === 0 && rare.value === 0) {
      return { command: { type: "battleFlee", side: 0 }, rng: rare.rng };
    }
    if (roll.value === 1) {
      return { command: { type: "battleShoot", side: 1, target: "нет" }, rng: roll.rng };
    }
    const command = chooseBattleCommand(state.battle.state) ?? { type: "battleWait", side: 0 };
    return { command, rng: roll.rng };
  }
  if (roll.value < 4) {
    return { command: { type: "endTurn", player: 0 }, rng: roll.rng };
  }
  if (roll.value === 4) {
    return { command: { type: "battleWait", side: 0 }, rng: roll.rng };
  }
  const x = nextInt(roll.rng, 0, SIZE - 1);
  const y = nextInt(x.rng, 0, SIZE - 1);
  const path = findPath(state, "A", { x: x.value, y: y.value });
  const steps = path.found ? [...path.steps] : [];
  return { command: { type: "moveHero", player: 0, heroId: "A", path: steps }, rng: y.rng };
}

/** Нарушенные свойства состояния; после любой команды список пуст. */
function stateViolations(state: GameState): string[] {
  const broken: string[] = [];
  const check = (holds: boolean, text: string): void => {
    if (!holds) {
      broken.push(text);
    }
  };
  const cells = new Set(state.objects.map((object) => `${object.x},${object.y}`));
  check(cells.size === state.objects.length, "два объекта в одной клетке");
  for (const object of state.objects) {
    if (object.type === "guard") {
      check(object.count >= 1 && object.count <= 4000, `число охранника ${object.count}`);
      check(Math.floor(object.power / 1000) === object.count, `сила ${object.power} не по числу`);
    }
  }
  const [hero] = state.heroes;
  check(state.heroes.length === (state.outcome === null ? 1 : 0), "герой и итог партии расходятся");
  if (hero === undefined) {
    check(state.battle === null, "бой без героя");
    return broken;
  }
  check(hero.level === levelOf(hero.experience), "уровень не по опыту");
  check(hero.attack + hero.defense === hero.level - 1, "атака плюс защита не по уровню");
  check(hero.army.length >= 1 && hero.army.length <= 7, `отрядов в армии ${hero.army.length}`);
  check(
    hero.army.every((stack) => stack.count >= 1),
    "пустой отряд в армии",
  );
  const under = state.objects.find((object) => object.x === hero.x && object.y === hero.y);
  check(under === undefined || under.type === "mine", "герой стоит на охраннике или кучке");
  if (state.battle !== null) {
    // Пока идёт бой, герой этого боя стоит в зоне его охранника.
    const guard = state.objects.find((object) => object.id === state.battle?.guardId);
    check(
      guard?.type === "guard" && inZone(guard, hero.x, hero.y),
      "герой боя не в зоне охранника",
    );
  }
  return broken;
}

/** Нарушенные свойства конца боя: что изменила команда, закончившая бой. */
function battleEndViolations(before: GameState, after: GameState): string[] {
  const [was] = before.heroes;
  const [now] = after.heroes;
  if (before.battle === null || after.battle !== null || was === undefined) {
    return [];
  }
  const broken: string[] = [];
  // Либо охранника нет и герой жив, либо героя нет и охранник на месте.
  const guardLeft = after.objects.some((object) => object.id === before.battle?.guardId);
  if (guardLeft !== (now === undefined)) {
    broken.push("после боя остались оба или не осталось никого");
  }
  if (now === undefined) {
    return broken;
  }
  // Существ не больше, чем было, по каждому отряду; порядок отрядов прежний.
  let slot = 0;
  for (const stack of now.army) {
    while (was.army[slot]?.creature !== stack.creature && slot < was.army.length) {
      slot += 1;
    }
    if (stack.count > (was.army[slot]?.count ?? 0)) {
      broken.push(`отряд ${stack.creature} вырос за бой`);
    }
    slot += 1;
  }
  if (now.experience <= was.experience) {
    broken.push("победа не дала опыта");
  }
  if (now.x !== was.x || now.y !== was.y || now.movement !== was.movement) {
    broken.push("бой сдвинул героя или изменил запас хода");
  }
  return broken;
}

describe("случайные партии с охранниками", () => {
  it("ни одно свойство не нарушено; повтор партии даёт то же состояние", () => {
    const seen = { battles: 0, wins: 0, defeats: 0, levels: 0, rejected: 0, grown: 0 };
    for (let seed = 1; seed <= GAMES; seed += 1) {
      const initial = randomGame(seed);
      let state = initial;
      let rng = createRng(seed * 977);
      const accepted: Command[] = [];
      for (let index = 0; index < COMMANDS; index += 1) {
        const next = randomCommand(state, rng);
        ({ rng } = next);
        const frozen = JSON.stringify(state);
        const result = applyCommand(state, next.command);
        // Команда не меняет состояние, которое ей дали.
        expect(JSON.stringify(state)).toBe(frozen);
        // После поражения отклоняется всё, и только с кодом GAME_OVER.
        const gameOver = !result.ok && result.code === "GAME_OVER";
        expect(gameOver).toBe(state.outcome !== null);
        if (!result.ok) {
          seen.rejected += 1;
          continue;
        }
        accepted.push(next.command);
        expect(stateViolations(result.state)).toEqual([]);
        expect(battleEndViolations(state, result.state)).toEqual([]);
        for (const event of result.events) {
          seen.battles += event.type === "battleStarted" ? 1 : 0;
          seen.wins += event.type === "guardDefeated" ? 1 : 0;
          seen.defeats += event.type === "gameOver" ? 1 : 0;
          seen.levels += event.type === "levelGained" ? 1 : 0;
          seen.grown += event.type === "guardGrew" ? 1 : 0;
        }
        ({ state } = result);
      }
      // Состояние — обычные данные: переживает JSON; повтор команд даёт его же.
      expect(JSON.parse(JSON.stringify(state))).toEqual(state);
      const replayed = replay(initial, accepted);
      expect(replayed.ok ? replayed.state : null).toEqual(state);
    }
    // Партии и правда доходили до всего, что проверяется.
    expect(seen.battles).toBeGreaterThan(GAMES);
    expect(seen.wins).toBeGreaterThan(GAMES / 2);
    expect(seen.defeats).toBeGreaterThan(5);
    expect(seen.levels).toBeGreaterThan(5);
    expect(seen.rejected).toBeGreaterThan(GAMES);
    expect(seen.grown).toBeGreaterThan(5);
  });
});
