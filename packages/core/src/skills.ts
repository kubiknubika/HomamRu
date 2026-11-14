/**
 * Навыки героя: восемь магических навыков, выбор при новом уровне.
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
