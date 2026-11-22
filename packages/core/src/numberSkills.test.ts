// Числовые навыки героя (65-hero-skills.md, порция 77): «Логистика», «Удача», «Боевой дух»,
// «Нападение», «Защита», «Стрельба», «Обучение», «Поместья», «Баллистика».
// Правил они не добавляют: каждый меняет число, которое в игре уже было.
import { describe, expect, it } from "vitest";
import { computeDamage } from "./battle/damage.ts";
import { applyCommand } from "./commands.ts";
import { army, duel, enemyTown, HOME, put, run, TO_TOWN } from "./duelKit.ts";
import { gainExperience } from "./hero.ts";
import { DAILY_MOVEMENT, movementFor } from "./heroIds.ts";
import { incomeOf } from "./objects.ts";
import { findPath } from "./pathfinding.ts";
import type { HeroSkill } from "./skills.ts";
import { gameWith, OPEN_FIELD } from "./testkit.ts";
import type { Command, GameState, MapObjectDefinition } from "./types.ts";

const RICH = { gold: 1000, wood: 0, ore: 0, mercury: 0, sulfur: 0, crystal: 0, gems: 0 };

type Skill = readonly [HeroSkill["id"], HeroSkill["level"]];

function withSkills(...skills: readonly Skill[]): GameState {
  const state = gameWith(OPEN_FIELD, [], { resources: RICH });
  return {
    ...state,
    heroes: state.heroes.map((hero) => ({
      ...hero,
      skills: skills.map(([id, level]) => ({ id, level })),
    })),
  };
}

/** Бой с охранником: герой с навыками идёт в его зону. */
function battleWith(skills: readonly Skill[]): NonNullable<GameState["battle"]>["state"] {
  const guard: MapObjectDefinition = { type: "guard", x: 4, y: 0, creature: "militia", count: 5 };
  const start = gameWith(OPEN_FIELD, [guard], { resources: RICH });
  const initial: GameState = {
    ...start,
    heroes: start.heroes.map((hero) => ({
      ...hero,
      skills: skills.map(([id, level]) => ({ id, level })),
    })),
  };
  const toZone: Command = { type: "moveHero", player: 0, heroId: "A", path: ["E", "E", "E"] };
  const moved = applyCommand(initial, toZone);
  if (!moved.ok || moved.state.battle === null) {
    throw new Error(moved.ok ? "бой не начался" : moved.message);
  }
  return moved.state.battle.state;
}

describe("логистика", () => {
  it("каждый уровень даёт 10 % запаса хода: 1100, 1200, 1300", () => {
    expect(movementFor([])).toBe(DAILY_MOVEMENT);
    expect(movementFor([{ id: "logistics", level: 1 }])).toBe(1100);
    expect(movementFor([{ id: "logistics", level: 2 }])).toBe(1200);
    expect(movementFor([{ id: "logistics", level: 3 }])).toBe(1300);
  });

  it("новый день даёт герою запас с навыком, а не 1000", () => {
    let state = withSkills(["logistics", 3]);
    expect(state.heroes[0]?.movement).toBe(DAILY_MOVEMENT);
    for (let day = 0; day < 7; day += 1) {
      const ended = applyCommand(state, { type: "endTurn", player: 0 });
      if (!ended.ok) {
        throw new Error(ended.message);
      }
      state = ended.state;
    }
    expect(state.heroes[0]?.movement).toBe(1300);
  });

  it("путь на два дня остаётся тем же по стоимости: навык меняет запас, а не карту", () => {
    const plain = gameWith(OPEN_FIELD, []);
    const fast = withSkills(["logistics", 3]);
    const slow = findPath(plain, "A", { x: 7, y: 7 });
    const quick = findPath(fast, "A", { x: 7, y: 7 });
    expect(slow.found && quick.found).toBe(true);
    expect(quick.found ? quick.cost : -1).toBe(slow.found ? slow.cost : -2);
  });
});

describe("удача и боевой дух", () => {
  it("удача героя становится удачей его отрядов: +1, +2, +3", () => {
    expect(battleWith([]).sides[0].luck).toBe(0);
    expect(battleWith([["luck", 2]]).sides[0].luck).toBe(2);
    expect(battleWith([["luck", 3]]).sides[0].luck).toBe(3);
  });

  it("боевой дух прибавляется к прежнему, но не выше трёх: 1 → 2, и упор в предел", () => {
    expect(battleWith([]).sides[0].morale).toBe(1);
    expect(battleWith([["leadership", 1]]).sides[0].morale).toBe(2);
    // Было 1 и +3 — предел боя 3, как в Heroes 3.
    expect(battleWith([["leadership", 3]]).sides[0].morale).toBe(3);
  });
});

describe("боевые проценты", () => {
  it("«Нападение», «Защита», «Стрельба» и «Баллистика» доходят до героя в бою", () => {
    const hero = battleWith([
      ["offence", 2],
      ["armorer", 3],
      ["archery", 1],
      ["ballistics", 2],
    ]).sides[0].hero;
    expect(hero).toMatchObject({ offence: 20, armorer: 15, archery: 10, ballistics: 2 });
    expect(battleWith([]).sides[0].hero).toMatchObject({
      offence: 0,
      armorer: 0,
      archery: 0,
      ballistics: 0,
    });
  });

  it("«Стрельба» и «Нападение» прибавляют урон, «Защита» его снимает", () => {
    // Прямая проверка правила: проценты ложатся на урон, дробь отбрасывается в конце.
    const base = 100;
    const plain = computeDamage(base, 10, 10, false, 0);
    const offence = Math.floor((plain * 120) / 100);
    expect(computeDamage(base, 10, 10, false, 0)).toBe(plain);
    expect(offence).toBeGreaterThan(plain);
    const guarded = Math.floor((plain * 85) / 100);
    expect(guarded).toBeLessThan(plain);
  });

  it("катапульта стреляет 24 раза, с «Баллистикой» — на 1, 2 или 3 больше", () => {
    // В первом раунде катапульта уже выстрелила: в начале боя у неё 24 выстрела, остаётся 23.
    const plain = siegeShots([]);
    expect(plain).toBe(23);
    expect(siegeShots([["ballistics", 1]])).toBe(plain + 1);
    expect(siegeShots([["ballistics", 3]])).toBe(plain + 3);
  });
});

/** Выстрелов катапульты в начале осады при таких навыках героя. */
function siegeShots(skills: readonly Skill[]): number {
  const base = duel([HOME, enemyTown(army("militia:5", "slinger:4"))]);
  const state: GameState = {
    ...base,
    heroes: base.heroes.map((hero) => ({
      ...hero,
      skills: skills.map(([id, level]) => ({ id, level })),
    })),
  };
  const at = put(state, "A", 3, 3);
  const moved = run(at, TO_TOWN);
  const stacks = moved.battle?.state.stacks ?? [];
  return stacks.find((stack) => stack.creature.id === "catapult")?.shots ?? 0;
}

describe("обучение", () => {
  it("опыт за бой больше на проценты навыка, дробь отбрасывается", () => {
    const state = gameWith(OPEN_FIELD, []);
    const hero = state.heroes[0];
    if (hero === undefined) {
      throw new Error("героя нет");
    }
    expect(gainExperience(hero, 1000, state.rng, []).hero.experience).toBe(1000);
    expect(
      gainExperience({ ...hero, skills: [{ id: "learning", level: 3 }] }, 1000, state.rng, []).hero
        .experience,
    ).toBe(1150);
    // Дробь отбрасывается: 1000 × 105 % = 1050, 33 × 105 % = 34.
    expect(
      gainExperience({ ...hero, skills: [{ id: "learning", level: 1 }] }, 33, state.rng, []).hero
        .experience,
    ).toBe(34);
  });
});

describe("поместья", () => {
  it("герой приносит золото сверх дохода, и только своему игроку", () => {
    expect(incomeOf(withSkills(["estates", 2]), 0).gold).toBe(250);
    expect(incomeOf(withSkills(["estates", 2]), 1).gold).toBe(0);
    expect(incomeOf(withSkills(), 0).gold).toBe(0);
  });
});
