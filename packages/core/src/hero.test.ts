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

const STATS = ["attack", "defense", "spellPower", "knowledge"] as const;

function statSum(hero: HeroState): number {
  return hero.attack + hero.defense + hero.spellPower + hero.knowledge;
}

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
    // У свежего героя сила магии 1 и знание 1; три уровня — ещё три единицы.
    expect(statSum(gained.hero)).toBe(5);
    expect(events.map((event) => event.type)).toEqual([
      "experienceGained",
      "levelGained",
      "levelGained",
      "levelGained",
      // Навыки предлагаются по одному выбору за раз: остальные два ждут.
      "skillsOffered",
    ]);
    expect(gained.hero.skillOffer).toHaveLength(2);
    expect(gained.hero.skillsOwed).toBe(2);
    expect(events.slice(1, 4)).toMatchObject([{ level: 2 }, { level: 3 }, { level: 4 }]);
  });

  it("свойство: уровень соответствует опыту, четыре характеристики в сумме растут на уровень − 1", () => {
    const ups = { attack: 0, defense: 0, spellPower: 0, knowledge: 0 };
    const fresh = freshHero();
    let levels = 0;
    for (let seed = 1; seed <= 200; seed += 1) {
      let hero = freshHero();
      let rng = createRng(seed);
      for (const amount of [seed * 37, 990, seed * 411, 5000]) {
        const before = hero.experience;
        ({ hero, rng } = gainExperience(hero, amount, rng, []));
        expect(hero.experience).toBe(before + amount);
        expect(hero.level).toBe(levelOf(hero.experience));
        expect(statSum(hero)).toBe(hero.level + 1);
      }
      for (const stat of STATS) {
        ups[stat] += hero[stat] - fresh[stat];
      }
      levels += hero.level - 1;
    }
    // Четыре характеристики выпадают поровну: доля каждой близка к четверти.
    for (const stat of STATS) {
      expect(ups[stat] / levels).toBeGreaterThan(0.21);
      expect(ups[stat] / levels).toBeLessThan(0.29);
    }
  });

  it("рост знания не добавляет маны сам: мана прежняя, растёт только её предел", () => {
    let hero = freshHero();
    let rng = createRng(3);
    ({ hero, rng } = gainExperience(hero, 60_000, rng, []));
    expect(hero.knowledge).toBeGreaterThan(1);
    expect(hero.mana).toBe(10);
  });

  it("один и тот же генератор — одни и те же прибавки", () => {
    const a = gainExperience(freshHero(), 20_000, createRng(9), []);
    const b = gainExperience(freshHero(), 20_000, createRng(9), []);
    expect(a).toEqual(b);
  });
});
