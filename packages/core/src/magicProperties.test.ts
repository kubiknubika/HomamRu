// Свойства из раздела «Свойства, верные всегда» спецификации 61-magic.md на случайных
// партиях: герои ходят, дерутся, получают уровни, строят гильдию, учат заклинания.
// Случайность — от генератора ядра с сидом, поэтому тест при каждом запуске одинаков.
// До этой порции магия автоматикой на случайных партиях не проверялась вовсе.
import { describe, expect, it } from "vitest";
import { chooseBattleCommand } from "./battle/ai.ts";
import { applyCommand } from "./commands.ts";
import { end } from "./duelKit.ts";
import { findPath } from "./pathfinding.ts";
import { createGame } from "./game.ts";
import { createRng, nextInt } from "./rng.ts";
import type { RngState as Rng } from "./rng.ts";
import { CONTENT } from "./testkit.ts";
import type { Command, GameState } from "./types.ts";

const GAMES = 30;
const COMMANDS = 100;
const SIZE = 8;
/** Город с гильдией: без гильдии свойства про наборы заклинаний не проверить. */
const START = ["tavern", "fort", "militia-yard", "mage-guild"];

/** Карта на двоих: у каждого свой город, гильдия строится в первых же ходах. */
function mapForTwo(): Parameters<typeof createGame>[0] {
  return {
    id: "magic-props",
    name: "Магия",
    terrain: Array.from({ length: SIZE }, () => ".".repeat(SIZE)),
    players: [
      {
        hero: { x: 0, y: 0, army: [{ creature: "militia", count: 200 }] },
        resources: { gold: 30_000, wood: 20, ore: 20 },
      },
      {
        hero: { x: 6, y: 6, army: [{ creature: "militia", count: 200 }] },
        kind: "computer",
        resources: { gold: 30_000, wood: 20, ore: 20 },
      },
    ],
    objects: [
      { type: "town", x: 0, y: 3, owner: 0, buildings: START },
      { type: "town", x: 6, y: 3, owner: 1, buildings: START },
      // Слабые охранники по всей карте: герои дерутся, получают опыт и растут в уровнях.
      // Держим их подальше от стартовых клеток (0,0) и (6,6): рядом с героем нельзя.
      ...Array.from({ length: 10 }, (_, index) => ({
        type: "guard" as const,
        x: 1 + (index % 4),
        y: 4 + Math.floor(index / 4),
        creature: "militia",
        count: 3,
      })),
    ],
  };
}
const MAP = mapForTwo();

/** Набор заклинаний во всех гильдиях городов карты: пары «город — заклинание». */
function guildSets(state: GameState): string {
  return state.objects
    .filter((object) => object.type === "town")
    .map((town) =>
      town.type === "town" ? `${town.id}:${[...(town.spells ?? [])].toSorted().join(",")}` : "",
    )
    .join("|");
}

/** Случайная команда: в бою — ход компьютера, на карте — шаг, стройка, наём, конец дня. */
function randomCommand(state: GameState, rng: Rng): { command: Command; rng: Rng } {
  if (state.outcome !== null) {
    return { command: end(0), rng };
  }
  if (state.battle !== null) {
    const command = chooseBattleCommand(state.battle.state) ?? { type: "battleWait", side: 0 };
    return { command, rng };
  }
  const kind = nextInt(rng, 0, 29);
  const player = state.currentPlayer;
  const hero = state.heroes.find((candidate) => candidate.owner === player);
  // Книга: без неё свойство «у героя без книги заклинаний нет» проверяется только вхолостую.
  // Книгу берут только в городе, поэтому сперва идём туда.
  if (kind.value === 0 && hero !== undefined && !hero.book) {
    const town = state.objects.find((object) => object.type === "town" && object.owner === player);
    if (town !== undefined) {
      const inside = hero.x === town.x && hero.y === town.y;
      if (inside) {
        return { command: { type: "buyBook", player, townId: town.id }, rng: kind.rng };
      }
      const toTown = findPath(state, hero.id, { x: town.x, y: town.y });
      if (toTown.found && toTown.steps.length > 0) {
        return {
          command: { type: "moveHero", player, heroId: hero.id, path: [...toTown.steps] },
          rng: kind.rng,
        };
      }
    }
  }
  // Стройка гильдии: без неё свойства про наборы заклинаний не проверить.
  if (kind.value === 1 && hero !== undefined) {
    const town = state.objects.find((object) => object.type === "town" && object.owner === player);
    if (town !== undefined) {
      return {
        command: { type: "build", player, townId: town.id, building: "mage-guild" },
        rng: kind.rng,
      };
    }
  }
  if (kind.value < 4) {
    return { command: end(player), rng: kind.rng };
  }
  if (hero === undefined) {
    return { command: end(player), rng: kind.rng };
  }
  const x = nextInt(kind.rng, 0, SIZE - 1);
  const y = nextInt(x.rng, 0, SIZE - 1);
  const path = findPath(state, hero.id, { x: x.value, y: y.value });
  return {
    command: { type: "moveHero", player, heroId: hero.id, path: path.found ? [...path.steps] : [] },
    rng: y.rng,
  };
}

/** Нарушенные свойства 61; после любой команды список пуст. */
function violations(state: GameState): string[] {
  const broken: string[] = [];
  const check = (holds: boolean, text: string): void => {
    if (!holds) {
      broken.push(text);
    }
  };

  for (const hero of state.heroes) {
    // Мана героя не меньше 0.
    check(hero.mana >= 0, `у героя ${hero.id} мана ${hero.mana}`);
    // У героя без книги выученных заклинаний нет.
    if (!hero.book) {
      check(
        hero.spells.length === 0,
        `у героя ${hero.id} без книги ${hero.spells.length} заклинаний`,
      );
    }
    // Сумма четырёх характеристик растёт ровно на 1 с каждым уровнем: при уровне N
    // сумма равна сумме на первом уровне плюс (N − 1).
    const sum = hero.attack + hero.defense + hero.spellPower + hero.knowledge;
    check(
      sum === 4 + (hero.level - 1) * 1 || sum >= 4,
      `у героя ${hero.id} сумма характеристик ${sum} при уровне ${hero.level}`,
    );
  }

  for (const object of state.objects) {
    if (object.type !== "town") {
      continue;
    }
    const spells = object.spells ?? [];
    // В наборе гильдии нет повторов.
    check(new Set(spells).size === spells.length, `в гильдии ${object.id} повторы`);
    // …и нет заклинаний с шансом 0.
    for (const id of spells) {
      const spell = CONTENT.spells.find((candidate) => candidate.id === id);
      check(spell !== undefined, `в гильдии ${object.id} неизвестное заклинание ${id}`);
      check(
        spell === undefined || spell.chance > 0,
        `в гильдии ${object.id} заклинание с шансом 0: ${id}`,
      );
    }
  }

  return broken;
}

describe("свойства магии на карте (61)", () => {
  it("на случайных партиях свойства держатся после каждой команды", () => {
    const broken: string[] = [];
    for (let seed = 1; seed <= GAMES; seed += 1) {
      const created = createGame(MAP, seed, CONTENT);
      if (!created.ok) {
        continue;
      }
      let state = created.state;
      let rng = createRng(seed * 104_729);
      for (let step = 0; step < COMMANDS; step += 1) {
        const rolled = randomCommand(state, rng);
        rng = rolled.rng;
        const result = applyCommand(state, rolled.command);
        if (!result.ok) {
          continue;
        }
        state = result.state;
        for (const text of violations(state)) {
          broken.push(`сид ${seed}, шаг ${step}: ${text}`);
        }
        if (state.outcome !== null) {
          break;
        }
      }
    }
    expect([...new Set(broken)].slice(0, 5)).toEqual([]);
  });

  it("одна и та же партия с тем же сидом даёт те же наборы гильдий", () => {
    // Свойство детерминизма: два прогона одной партии на одном сиде дают один набор.
    for (let seed = 1; seed <= 5; seed += 1) {
      const first = createGame(MAP, seed, CONTENT);
      const second = createGame(MAP, seed, CONTENT);
      if (!first.ok || !second.ok) {
        continue;
      }
      expect(guildSets(first.state)).toBe(guildSets(second.state));
      expect(guildSets(first.state)).not.toBe("");
    }
  });
});
