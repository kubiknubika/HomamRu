/**
 * Навыки героя: восемь магических и пять «числовых» — всего тринадцать, выбор при новом уровне.
 * Спецификация: docs/mechanics/65-hero-skills.md.
 */
import { nextInt } from "./rng.ts";
import type { RngState } from "./rng.ts";
import type { SpellDefinition, SpellSchool } from "./spells.ts";

export const SKILL_IDS = [
  "fire-magic",
  "water-magic",
  "earth-magic",
  "air-magic",
  "wisdom",
  "mysticism",
  "intelligence",
  "sorcery",
  "logistics",
  "luck",
  "leadership",
  "offence",
  "armorer",
  "archery",
  "learning",
  "estates",
  "ballistics",
] as const;
export type SkillId = (typeof SKILL_IDS)[number];

/** Уровень навыка: 1 — базовый, 2 — продвинутый, 3 — экспертный. */
export type SkillLevel = 1 | 2 | 3;
const MAX_SKILL_LEVEL = 3;
/** Сколько навыков может знать герой. Число — из Heroes 3. */
export const MAX_SKILLS = 8;

export interface HeroSkill {
  readonly id: SkillId;
  readonly level: SkillLevel;
}

export const SKILL_NAMES: Readonly<Record<SkillId, string>> = {
  "fire-magic": "Магия огня",
  "water-magic": "Магия воды",
  "earth-magic": "Магия земли",
  "air-magic": "Магия воздуха",
  wisdom: "Мудрость",
  mysticism: "Мистицизм",
  intelligence: "Интеллект",
  sorcery: "Волшебство",
  logistics: "Логистика",
  luck: "Удача",
  leadership: "Боевой дух",
  offence: "Нападение",
  armorer: "Защита",
  archery: "Стрельба",
  learning: "Обучение",
  estates: "Поместья",
  ballistics: "Баллистика",
};

const SCHOOL_SKILLS: Readonly<Record<SpellSchool, SkillId>> = {
  fire: "fire-magic",
  water: "water-magic",
  earth: "earth-magic",
  air: "air-magic",
};

/** Числа навыков по уровням (базовый, продвинутый, экспертный) — из Heroes 3. */
const MYSTICISM_MANA = [2, 3, 4] as const;
const INTELLIGENCE_PERCENT = [25, 50, 100] as const;
const SORCERY_PERCENT = [5, 10, 15] as const;
/** «Логистика»: на сколько процентов больше запас хода на суше. */
const LOGISTICS_PERCENT = [10, 20, 30] as const;
/** «Нападение»: на сколько процентов больше урон в ближнем бою и от ответного удара. */
const OFFENCE_PERCENT = [10, 20, 30] as const;
/** «Защита»: на сколько процентов меньше урона по своим отрядам. */
const ARMORER_PERCENT = [5, 10, 15] as const;
/** «Стрельба»: на сколько процентов больше урон выстрела. */
const ARCHERY_PERCENT = [10, 25, 50] as const;
/** «Обучение»: на сколько процентов больше опыта за бой. */
const LEARNING_PERCENT = [5, 10, 15] as const;
/** «Поместья»: сколько золота в день приносит герой сверх дохода. */
const ESTATES_GOLD = [125, 250, 500] as const;
/** «Баллистика»: сколько лишних выстрелов у катапульты. */
const BALLISTICS_SHOTS = [1, 2, 3] as const;

type Skilled = { readonly skills: readonly HeroSkill[] };

/** Уровень навыка у героя; 0 — навыка нет. */
export function skillLevel(hero: Skilled, id: SkillId): number {
  return hero.skills.find((skill) => skill.id === id)?.level ?? 0;
}

function byLevel(hero: Skilled, id: SkillId, values: readonly number[], none: number): number {
  return values[skillLevel(hero, id) - 1] ?? none;
}

/** На каком уровне герой колдует заклинание: лучший из уровней его школ; 0 — без навыка. */
export function masteryOf(hero: Skilled, spell: Pick<SpellDefinition, "schools">): number {
  return Math.max(0, ...spell.schools.map((school) => skillLevel(hero, SCHOOL_SKILLS[school])));
}

/** Сколько маны возвращается за ночь: 1, с «Мистицизмом» — 2, 3 или 4. */
export function manaPerDay(hero: Skilled): number {
  return byLevel(hero, "mysticism", MYSTICISM_MANA, 1);
}

/** На сколько процентов «Интеллект» увеличивает запас маны. */
export function intelligencePercent(hero: Skilled): number {
  return byLevel(hero, "intelligence", INTELLIGENCE_PERCENT, 0);
}

/** На сколько процентов «Волшебство» увеличивает урон заклинаний. */
export function sorceryPercent(hero: Skilled): number {
  return byLevel(hero, "sorcery", SORCERY_PERCENT, 0);
}

/** На сколько процентов «Логистика» увеличивает дневной запас хода. */
export function logisticsPercent(hero: Skilled): number {
  return byLevel(hero, "logistics", LOGISTICS_PERCENT, 0);
}

/** Дневной запас хода героя: 1000 и больше с «Логистикой»; дробь отбрасывается. */
export function dailyMovementOf(hero: Skilled, base: number): number {
  return Math.floor((base * (100 + logisticsPercent(hero))) / 100);
}

/** Насколько удача героя выше обычной: 0, с навыком «Удача» — 1, 2 или 3. */
export function luckBonusOf(hero: Skilled): number {
  return skillLevel(hero, "luck");
}

/** Насколько боевой дух героя выше обычного: 0, с навыком — 1, 2 или 3. */
export function leadershipBonusOf(hero: Skilled): number {
  return skillLevel(hero, "leadership");
}

/** Предел удачи и боевого духа в бою: числа из Heroes 3. */
export const MAX_BATTLE_LUCK = 3;
export const MAX_BATTLE_MORALE = 3;

/** Удача отрядов героя: удача армии и «Удача», но не больше трёх. */
export function battleLuckOf(base: number, hero: Skilled): number {
  return Math.min(MAX_BATTLE_LUCK, base + luckBonusOf(hero));
}

/** Боевой дух отрядов героя: дух армии и «Боевой дух», но не больше трёх. */
export function battleMoraleOf(base: number, hero: Skilled): number {
  return Math.min(MAX_BATTLE_MORALE, base + leadershipBonusOf(hero));
}

/** На сколько процентов «Нападение» увеличивает урон в ближнем бою и от ответного удара. */
export function offencePercent(hero: Skilled): number {
  return byLevel(hero, "offence", OFFENCE_PERCENT, 0);
}

/** На сколько процентов «Защита» уменьшает урон по отрядам героя. */
export function armorerPercent(hero: Skilled): number {
  return byLevel(hero, "armorer", ARMORER_PERCENT, 0);
}

/** На сколько процентов «Стрельба» увеличивает урон выстрела. */
export function archeryPercent(hero: Skilled): number {
  return byLevel(hero, "archery", ARCHERY_PERCENT, 0);
}

/** На сколько процентов «Обучение» увеличивает опыт за бой. */
export function learningPercent(hero: Skilled): number {
  return byLevel(hero, "learning", LEARNING_PERCENT, 0);
}

/** Сколько золота в день приносит «Поместья»; 0 — без навыка. */
export function estatesGold(hero: Skilled): number {
  return byLevel(hero, "estates", ESTATES_GOLD, 0);
}

/** Сколько лишних выстрелов даёт катапульте «Баллистика»; 0 — без навыка. */
export function ballisticsShots(hero: Skilled): number {
  return byLevel(hero, "ballistics", BALLISTICS_SHOTS, 0);
}

/** До какого круга герой учит заклинания: 2, с «Мудростью» — 3, 4 или 5. */
export function learnableLevel(hero: Skilled): number {
  return 2 + skillLevel(hero, "wisdom");
}

/** Герой после выбора навыка: новый навык базового уровня либо взятый — на уровень выше. */
export function withSkill(skills: readonly HeroSkill[], id: SkillId): HeroSkill[] {
  const known = skills.find((skill) => skill.id === id);
  if (known === undefined) {
    return [...skills, { id, level: 1 }];
  }
  const level = Math.min(known.level + 1, MAX_SKILL_LEVEL) as SkillLevel;
  return skills.map((skill) => (skill.id === id ? { id, level } : skill));
}

function pick<T>(rng: RngState, items: readonly T[]): { value: T | undefined; rng: RngState } {
  if (items.length <= 1) {
    // Выбирать не из чего — случайное число не тратится.
    return { value: items[0], rng };
  }
  const roll = nextInt(rng, 0, items.length - 1);
  return { value: items[roll.value], rng: roll.rng };
}

/**
 * Что предложить герою с новым уровнем: одно повышение взятого навыка и один новый навык.
 * Нечего повышать — два новых; нельзя брать новые — два повышения. Шансы равные.
 * Пустой список — предлагать нечего.
 */
export function rollSkillOffer(
  skills: readonly HeroSkill[],
  initial: RngState,
): { offer: SkillId[]; rng: RngState } {
  let upgrades = skills.filter((skill) => skill.level < MAX_SKILL_LEVEL).map((skill) => skill.id);
  let fresh =
    skills.length >= MAX_SKILLS
      ? []
      : SKILL_IDS.filter((id) => !skills.some((skill) => skill.id === id));
  let rng = initial;
  const offer: SkillId[] = [];
  const take = (from: "upgrades" | "fresh"): void => {
    const picked = pick(rng, from === "upgrades" ? upgrades : fresh);
    ({ rng } = picked);
    const { value } = picked;
    if (value !== undefined) {
      offer.push(value);
      upgrades = upgrades.filter((id) => id !== value);
      fresh = fresh.filter((id) => id !== value);
    }
  };
  take("upgrades");
  take("fresh");
  if (offer.length < 2) {
    // Одного из двух видов не нашлось: второе предложение — того же вида, что первое.
    take(upgrades.length > 0 ? "upgrades" : "fresh");
  }
  return { offer, rng };
}

export const SKILL_LEVEL_NAMES: readonly string[] = ["", "базовый", "продвинутый", "экспертный"];

/** Навыки героя словами: «Магия огня (базовый)». */
export function formatSkills(skills: readonly HeroSkill[]): string[] {
  return skills.map(
    (skill) => `${SKILL_NAMES[skill.id]} (${SKILL_LEVEL_NAMES[skill.level] ?? ""})`,
  );
}

/** Выбор одного из навыков, предложенных герою с новым уровнем (65-hero-skills.md). */
export interface ChooseSkillCommand {
  readonly type: "chooseSkill";
  readonly player: number;
  readonly heroId: string;
  readonly skill: SkillId;
}
