// Таблицы и свойства из docs/mechanics/22-hero.md. Числа посчитаны скриптом examples/hero.py.
import { describe, expect, it } from "vitest";
import type { GameEvent } from "./events.ts";
import { experienceForLevel, gainExperience, levelOf, MAX_LEVEL } from "./hero.ts";
import { createRng } from "./rng.ts";
import { gameWith, OPEN_FIELD } from "./testkit.ts";
import type { HeroState } from "./types.ts";

const THRESHOLDS = [
  0, 1000, 2000, 3200, 4600, 6200, 8000, 10_000, 12_200, 14_700, 17_500, 20_600, 24_320, 28_784,
  34_140, 40_567, 48_279, 57_533, 68_637, 81_961,
];

function freshHero(): HeroState {
  const [hero] = gameWith(OPEN_FIELD, []).heroes;
  if (hero === undefined) {
    throw new Error("героя нет");
  }
  return hero;
}

describe("уровни героя", () => {
  it("пороги опыта для уровней 1–20 — как в таблице", () => {
    expect(THRESHOLDS.map((_, index) => experienceForLevel(index + 1))).toEqual(THRESHOLDS);
  });

  it("наибольший уровень — 159, его порог ещё точное целое", () => {
    expect(MAX_LEVEL).toBe(159);
    expect(experienceForLevel(159)).toBe(8_107_947_637_398_986);
    expect(experienceForLevel(160)).toBeUndefined();
    expect(levelOf(Number.MAX_SAFE_INTEGER)).toBe(159);
  });

  it("опыт ровно на пороге даёт уровень, на единицу меньше — нет", () => {
    for (const [index, threshold] of THRESHOLDS.entries()) {
      expect(levelOf(threshold)).toBe(index + 1);
      expect(levelOf(threshold + 1)).toBe(index + 1);
    }
    expect(levelOf(999)).toBe(1);
    expect(levelOf(81_960)).toBe(19);
  });
});

describe("получение опыта", () => {
  it("опыта меньше порога: уровень прежний, случайные числа не тратятся", () => {
    const events: GameEvent[] = [];
    const rng = createRng(5);
    const gained = gainExperience(freshHero(), 180, rng, events);
    expect(gained.hero).toMatchObject({ experience: 180, level: 1, attack: 0, defense: 0 });
    expect(gained.rng).toBe(rng);
    expect(events).toEqual([{ type: "experienceGained", heroId: "A", amount: 180, total: 180 }]);
  });

  it("опыта хватило на несколько уровней: по броску на каждый, события по порядку", () => {
    const events: GameEvent[] = [];
    // 3200 — порог четвёртого уровня: три уровня сразу.
    const gained = gainExperience(freshHero(), 3200, createRng(5), events);
    expect(gained.hero.level).toBe(4);
    expect(gained.hero.attack + gained.hero.defense).toBe(3);
    expect(events.map((event) => event.type)).toEqual([
      "experienceGained",
      "levelGained",
      "levelGained",
      "levelGained",
    ]);
    expect(events.slice(1)).toMatchObject([{ level: 2 }, { level: 3 }, { level: 4 }]);
  });

  it("свойство: уровень соответствует опыту, атака плюс защита растут на уровень − 1", () => {
    let attackUps = 0;
    let levels = 0;
    for (let seed = 1; seed <= 200; seed += 1) {
      let hero = freshHero();
      let rng = createRng(seed);
      for (const amount of [seed * 37, 990, seed * 411, 5000]) {
        const before = hero.experience;
        ({ hero, rng } = gainExperience(hero, amount, rng, []));
        expect(hero.experience).toBe(before + amount);
        expect(hero.level).toBe(levelOf(hero.experience));
        expect(hero.attack + hero.defense).toBe(hero.level - 1);
      }
      attackUps += hero.attack;
      levels += hero.level - 1;
    }
    // Атака и защита выпадают поровну: доля атаки близка к половине.
    expect(attackUps / levels).toBeGreaterThan(0.45);
    expect(attackUps / levels).toBeLessThan(0.55);
  });

  it("один и тот же генератор — одни и те же прибавки", () => {
    const a = gainExperience(freshHero(), 20_000, createRng(9), []);
    const b = gainExperience(freshHero(), 20_000, createRng(9), []);
    expect(a).toEqual(b);
  });
});
