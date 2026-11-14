// Правила и свойства из docs/mechanics/65-hero-skills.md: числа навыков и предложения.
import { describe, expect, it } from "vitest";
import { maxMana, restoreMana } from "./magic.ts";
import { createRng } from "./rng.ts";
import { afterVictory, chosen, heroOf } from "./skillKit.ts";
import {
  learnableLevel,
  manaPerDay,
  masteryOf,
  MAX_SKILLS,
  rollSkillOffer,
  SKILL_IDS,
  sorceryPercent,
  withSkill,
} from "./skills.ts";
import type { HeroSkill, SkillId } from "./skills.ts";
import { spellAtMastery } from "./spells.ts";
import { gameWith, OPEN_FIELD, spell, SPELLS } from "./testkit.ts";
import type { GameState, HeroState } from "./types.ts";

const skills = (...items: readonly (readonly [SkillId, 1 | 2 | 3])[]): HeroSkill[] =>
  items.map(([id, level]) => ({ id, level }));

function withHero(state: GameState, changes: Partial<HeroState>): GameState {
  return { ...state, heroes: state.heroes.map((hero) => ({ ...hero, ...changes })) };
}

const manaLimit = (level: 1 | 2 | 3): number =>
  maxMana({ knowledge: 3, skills: skills(["intelligence", level]) });
const advancedValue = (id: string): number => spellAtMastery(spell(id), 2).value;
const levelSum = (list: readonly HeroSkill[]): number =>
  list.reduce((sum, skill) => sum + skill.level, 0);

describe("числа навыков", () => {
  it("герой начинает без навыков; без навыков всё как раньше", () => {
    const hero = heroOf(gameWith(OPEN_FIELD, []));
    expect(hero).toMatchObject({ skills: [], skillOffer: [], skillsOwed: 0 });
    expect(manaPerDay(hero)).toBe(1);
    expect(learnableLevel(hero)).toBe(2);
    expect(sorceryPercent(hero)).toBe(0);
    expect(maxMana({ knowledge: 3, skills: [] })).toBe(30);
  });

  it("«Мистицизм»: 2, 3, 4 маны в день вместо одной", () => {
    const state = withHero(gameWith(OPEN_FIELD, []), { knowledge: 5, mana: 0 });
    const manaAfterNight = (level: 1 | 2 | 3): number =>
      heroOf(restoreMana(withHero(state, { skills: skills(["mysticism", level]) }))).mana;
    expect(heroOf(restoreMana(state)).mana).toBe(1);
    expect([1, 2, 3].map((level) => manaAfterNight(level as 1 | 2 | 3))).toEqual([2, 3, 4]);
  });

  it("«Интеллект»: запас маны +25, +50, +100 %, дробь отбрасывается", () => {
    expect([manaLimit(1), manaLimit(2), manaLimit(3)]).toEqual([37, 45, 60]);
  });

  it("«Интеллект» при взятии не меняет текущую ману", () => {
    const offered = withHero(gameWith(OPEN_FIELD, []), {
      knowledge: 3,
      mana: 30,
      skillOffer: ["intelligence", "wisdom"],
    });
    const hero = heroOf(chosen(offered, "intelligence"));
    expect(hero.mana).toBe(30);
    expect(maxMana(hero)).toBe(37);
  });

  it("«Мудрость»: круги 3, 4, 5; без неё — первые два", () => {
    expect(
      [1, 2, 3].map((level) => learnableLevel({ skills: skills(["wisdom", level as 1]) })),
    ).toEqual([3, 4, 5]);
    // Гильдия пока одного уровня: до шага 7.4 «Мудрость» ничего не меняет.
    expect(learnableLevel({ skills: [] })).toBe(2);
  });

  it("«Волшебство»: +5, +10, +15 % урона заклинаний", () => {
    expect(
      [1, 2, 3].map((level) => sorceryPercent({ skills: skills(["sorcery", level as 1]) })),
    ).toEqual([5, 10, 15]);
  });

  it("уровень заклинания — уровень его школы; у «Волшебной стрелы» — лучшая из школ", () => {
    const hero = { skills: skills(["fire-magic", 1], ["air-magic", 3], ["wisdom", 3]) };
    expect(masteryOf(hero, spell("curse"))).toBe(1);
    expect(masteryOf(hero, spell("haste"))).toBe(3);
    expect(masteryOf(hero, spell("magic-arrow"))).toBe(3);
    expect(masteryOf(hero, spell("cure"))).toBe(0);
  });
});

describe("заклинание с навыком школы", () => {
  it("без навыка — как в файле; базовый — дешевле на 1 ману, числа те же", () => {
    for (const item of SPELLS) {
      expect(spellAtMastery(item, 0)).toEqual({ ...item, mass: false });
      expect(spellAtMastery(item, 1)).toEqual({ ...item, cost: item.cost - 1, mass: false });
    }
  });

  it("свойство: цена с навыком не больше цены без навыка", () => {
    for (const item of SPELLS) {
      for (const mastery of [1, 2, 3]) {
        expect(spellAtMastery(item, mastery).cost).toBeLessThanOrEqual(item.cost);
      }
    }
  });

  it("продвинутый — сильнее; «Снять заклинания» ложится и на чужой отряд", () => {
    expect(
      Object.fromEntries(SPELLS.map((item) => [item.id, advancedValue(item.id)] as const)),
    ).toEqual({
      "magic-arrow": 20,
      shield: 70,
      "protection-from-fire": 50,
      "protection-from-water": 50,
      dispel: 0,
      cure: 20,
      bless: 1,
      curse: 1,
      bloodlust: 6,
      "stone-skin": 6,
      haste: 5,
      slow: 50,
    });
    expect(SPELLS.filter((item) => spellAtMastery(item, 2).mass === true)).toEqual([]);
    expect(
      SPELLS.filter((item) => spellAtMastery(item, 2).target === "any").map((item) => item.id),
    ).toEqual(["dispel"]);
  });

  it("экспертный — на все отряды; «Волшебная стрела» бьёт один отряд, зато сильнее", () => {
    const single = SPELLS.filter((item) => spellAtMastery(item, 3).mass !== true);
    expect(single.map((item) => item.id)).toEqual(["magic-arrow"]);
    expect(spellAtMastery(spell("magic-arrow"), 3).value).toBe(30);
    expect(spellAtMastery(spell("cure"), 3).value).toBe(30);
    expect(spellAtMastery(spell("slow"), 3)).toMatchObject({ value: 50, target: "enemy" });
  });
});

describe("предложение навыков", () => {
  it("у героя без навыков — два разных новых", () => {
    const { offer } = rollSkillOffer([], createRng(1));
    expect(offer).toHaveLength(2);
    expect(new Set(offer).size).toBe(2);
  });

  it("первое — повышение взятого, второе — новый", () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const known = skills(["wisdom", 1], ["sorcery", 3]);
      const { offer } = rollSkillOffer(known, createRng(seed));
      // «Волшебство» уже экспертное — повышать можно только «Мудрость».
      expect(offer[0]).toBe("wisdom");
      expect(["wisdom", "sorcery"]).not.toContain(offer[1]);
    }
  });

  it("новых взять нельзя — оба предложения повышения; остался один вариант — он один", () => {
    const all = SKILL_IDS.map((id) => ({ id, level: 2 as const }));
    const { offer } = rollSkillOffer(all, createRng(3));
    expect(offer).toHaveLength(2);
    expect(new Set(offer).size).toBe(2);
    const last = SKILL_IDS.map((id, index) => ({
      id,
      level: index === 0 ? (2 as const) : (3 as const),
    }));
    expect(rollSkillOffer(last, createRng(3)).offer).toEqual([SKILL_IDS[0]]);
    const done = SKILL_IDS.map((id) => ({ id, level: 3 as const }));
    expect(rollSkillOffer(done, createRng(3)).offer).toEqual([]);
  });

  it("шансы равные: каждый навык бывает первым предложением новичку", () => {
    const seen = new Map<SkillId, number>();
    for (let seed = 1; seed <= 800; seed += 1) {
      const [first] = rollSkillOffer([], createRng(seed)).offer;
      if (first !== undefined) {
        seen.set(first, (seen.get(first) ?? 0) + 1);
      }
    }
    expect(seen.size).toBe(SKILL_IDS.length);
    for (const count of seen.values()) {
      // Ожидается 100 из 800; допуск широкий — проверяется, что перекоса нет.
      expect(count).toBeGreaterThan(60);
      expect(count).toBeLessThan(140);
    }
  });

  it("свойство: навыков не больше восьми, уровни 1–3, предложения различны и берутся", () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      let rng = createRng(seed);
      let known: HeroSkill[] = [];
      for (let step = 0; step < 40; step += 1) {
        const rolled = rollSkillOffer(known, rng);
        ({ rng } = rolled);
        const { offer } = rolled;
        expect(new Set(offer).size).toBe(offer.length);
        expect(offer.length).toBeLessThanOrEqual(2);
        const before = known;
        for (const id of offer) {
          // Каждое предложение можно взять: герой становится ровно на один уровень навыка богаче.
          expect(levelSum(withSkill(before, id))).toBe(levelSum(before) + 1);
        }
        const pick = offer[(seed + step) % 2] ?? offer[0];
        if (pick === undefined) {
          break;
        }
        known = withSkill(known, pick);
        expect(known.length).toBeLessThanOrEqual(MAX_SKILLS);
        expect(known.every((skill) => skill.level >= 1 && skill.level <= 3)).toBe(true);
      }
      // 24 выбора исчерпывают всё: восемь навыков экспертного уровня.
      expect(known).toHaveLength(MAX_SKILLS);
      expect(known.every((skill) => skill.level === 3)).toBe(true);
    }
  });

  it("свойство: тот же сид — те же предложения", () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      expect(afterVictory(200, seed).heroes).toEqual(afterVictory(200, seed).heroes);
    }
    const offers = new Set(
      Array.from({ length: 20 }, (_, seed) =>
        heroOf(afterVictory(200, seed + 1)).skillOffer.join(),
      ),
    );
    expect(offers.size).toBeGreaterThan(1);
  });
});
