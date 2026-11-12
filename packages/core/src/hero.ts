/**
 * Герой: опыт и уровни. Спецификация: docs/mechanics/22-hero.md.
 */
import type { GameEvent } from "./events.ts";
import { nextInt } from "./rng.ts";
import type { RngState } from "./rng.ts";
import type { HeroState } from "./types.ts";

/** Боевой дух и удача армии героя и охранника. */
export const ARMY_MORALE = 1;
export const ARMY_LUCK = 0;

/** Пороги опыта для уровней 1–15: таблица Heroes 3. */
const FIRST_THRESHOLDS = [
  0, 1000, 2000, 3200, 4600, 6200, 8000, 10_000, 12_200, 14_700, 17_500, 20_600, 24_320, 28_784,
  34_140,
];

/** Дальше каждая разница больше прошлой на её пятую часть. */
const DIFF_GROWTH_DIVISOR = 5;

/**
 * Пороги опыта по уровням: `LEVEL_THRESHOLDS[level - 1]`. Таблица кончается там,
 * где следующий порог уже не хранится точным целым числом.
 */
const LEVEL_THRESHOLDS: readonly number[] = buildThresholds();

function buildThresholds(): number[] {
  const thresholds = [...FIRST_THRESHOLDS];
  let last = thresholds.at(-1) ?? 0;
  let diff = last - (thresholds.at(-2) ?? 0);
  for (;;) {
    diff += Math.floor(diff / DIFF_GROWTH_DIVISOR);
    if (last + diff > Number.MAX_SAFE_INTEGER) {
      return thresholds;
    }
    last += diff;
    thresholds.push(last);
  }
}

/** Наибольший уровень героя. */
export const MAX_LEVEL = LEVEL_THRESHOLDS.length;

/** Опыт, с которого начинается уровень; для уровня выше наибольшего — `undefined`. */
export function experienceForLevel(level: number): number | undefined {
  return LEVEL_THRESHOLDS[level - 1];
}

/** Уровень, который соответствует опыту. */
export function levelOf(experience: number): number {
  let level = 1;
  while ((experienceForLevel(level + 1) ?? Number.POSITIVE_INFINITY) <= experience) {
    level += 1;
  }
  return level;
}

/**
 * Даёт герою опыт и все уровни, на которые его хватило. Каждый уровень — свой бросок:
 * +1 к атаке или +1 к защите, поровну. События дописываются в список.
 */
export function gainExperience(
  hero: HeroState,
  amount: number,
  initialRng: RngState,
  events: GameEvent[],
): { hero: HeroState; rng: RngState } {
  const experience = Math.min(hero.experience + amount, Number.MAX_SAFE_INTEGER);
  events.push({ type: "experienceGained", heroId: hero.id, amount, total: experience });
  const target = levelOf(experience);
  let { level, attack, defense } = hero;
  let rng = initialRng;
  while (level < target) {
    const roll = nextInt(rng, 0, 1);
    ({ rng } = roll);
    level += 1;
    const stat = roll.value === 0 ? "attack" : "defense";
    attack += stat === "attack" ? 1 : 0;
    defense += stat === "defense" ? 1 : 0;
    events.push({ type: "levelGained", heroId: hero.id, level, stat });
  }
  return { hero: { ...hero, experience, level, attack, defense }, rng };
}
