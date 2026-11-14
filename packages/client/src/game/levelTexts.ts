/** Окно нового уровня: тексты. Спецификация: docs/mechanics/65-hero-skills.md. */
import { SKILL_LEVEL_NAMES, SKILL_NAMES, skillLevel } from "@homamru/core";
import type { HeroState, SkillId } from "@homamru/core";
import { STAT_NAMES } from "./captions.ts";
import type { LevelUp } from "./sessionTypes.ts";

const SKILL_TEXTS: Readonly<Record<SkillId, readonly [string, string, string]>> = {
  "fire-magic": [
    "заклинания огня дешевле на 1 ману",
    "заклинания огня ещё и сильнее",
    "заклинания огня ложатся на все отряды",
  ],
  "water-magic": [
    "заклинания воды дешевле на 1 ману",
    "заклинания воды ещё и сильнее",
    "заклинания воды ложатся на все отряды",
  ],
  "earth-magic": [
    "заклинания земли дешевле на 1 ману",
    "заклинания земли ещё и сильнее",
    "заклинания земли ложатся на все отряды",
  ],
  "air-magic": [
    "заклинания воздуха дешевле на 1 ману",
    "заклинания воздуха ещё и сильнее",
    "заклинания воздуха ложатся на все отряды",
  ],
  wisdom: [
    "герой учит заклинания 3-го круга",
    "герой учит заклинания 4-го круга",
    "герой учит заклинания 5-го круга",
  ],
  mysticism: ["2 маны в день вместо 1", "3 маны в день", "4 маны в день"],
  intelligence: [
    "запас маны больше на четверть",
    "запас маны больше в полтора раза",
    "запас маны вдвое больше",
  ],
  sorcery: ["урон заклинаний +5 %", "урон заклинаний +10 %", "урон заклинаний +15 %"],
};

/** Уровень, за который герой выбирает навык сейчас: за ним могут ждать ещё выборы. */
function choiceLevel(hero: HeroState): number {
  return hero.level - hero.skillsOwed;
}

/** Заголовок окна: «Новый уровень: 2». */
export function levelTitle(hero: HeroState): string {
  return `Новый уровень: ${choiceLevel(hero)}`;
}

/** Строка под заголовком: «Атака +1. Выберите навык». Что выросло, неизвестно — без первой части. */
export function levelText(hero: HeroState, levelUps: readonly LevelUp[]): string {
  const level = choiceLevel(hero);
  const gained = levelUps.findLast((item) => item.heroId === hero.id && item.level === level);
  if (gained === undefined) {
    return "Выберите навык";
  }
  const stat = STAT_NAMES[gained.stat];
  return `${stat.charAt(0).toUpperCase()}${stat.slice(1)} +1. Выберите навык`;
}

/** Кнопка навыка: «Магия огня (базовый) — заклинания огня дешевле на 1 ману». */
export function skillButton(hero: HeroState, skill: SkillId): string {
  const next = Math.min(skillLevel(hero, skill) + 1, 3);
  const text = SKILL_TEXTS[skill][next - 1] ?? "";
  return `${SKILL_NAMES[skill]} (${SKILL_LEVEL_NAMES[next] ?? ""}) — ${text}`;
}
