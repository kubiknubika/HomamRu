/**
 * Герой: опыт и уровни. Спецификация: docs/mechanics/22-hero.md.
 */
import type { GameEvent } from "./events.ts";
import { nextInt } from "./rng.ts";
import type { RngState } from "./rng.ts";
import { learningPercent, rollSkillOffer, withSkill } from "./skills.ts";
import { reject } from "./types.ts";
import type { ChooseSkillCommand, CommandResult, GameState, HeroState } from "./types.ts";

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

/** Что может вырасти с уровнем: шансы равные (61-magic.md). */
const LEVEL_STATS = ["attack", "defense", "spellPower", "knowledge"] as const;

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
 * +1 к атаке, защите, силе магии или знанию, поровну. События дописываются в список.
 */
export function gainExperience(
  hero: HeroState,
  amount: number,
  initialRng: RngState,
  events: GameEvent[],
): { hero: HeroState; rng: RngState } {
  // «Обучение»: за бой герой получает больше опыта (65-hero-skills.md); дробь отбрасывается.
  const gained = Math.floor((amount * (100 + learningPercent(hero))) / 100);
  const experience = Math.min(hero.experience + gained, Number.MAX_SAFE_INTEGER);
  events.push({ type: "experienceGained", heroId: hero.id, amount: gained, total: experience });
  const target = levelOf(experience);
  let { level } = hero;
  const stats = {
    attack: hero.attack,
    defense: hero.defense,
    spellPower: hero.spellPower,
    knowledge: hero.knowledge,
  };
  let rng = initialRng;
  while (level < target) {
    const roll = nextInt(rng, 0, LEVEL_STATS.length - 1);
    ({ rng } = roll);
    level += 1;
    const stat = LEVEL_STATS[roll.value] ?? "attack";
    stats[stat] += 1;
    events.push({ type: "levelGained", heroId: hero.id, level, stat });
  }
  const owed = hero.skillsOwed + (level - hero.level);
  return offerSkills({ ...hero, experience, level, ...stats, skillsOwed: owed }, rng, events);
}

/**
 * Если герою положен выбор навыка и нынешнего предложения нет — бросает новое.
 * Предлагать нечего — оставшиеся выборы сгорают.
 */
function offerSkills(
  hero: HeroState,
  initial: RngState,
  events: GameEvent[],
): { hero: HeroState; rng: RngState } {
  if (hero.skillOffer.length > 0 || hero.skillsOwed === 0) {
    return { hero, rng: initial };
  }
  const { offer, rng } = rollSkillOffer(hero.skills, initial);
  if (offer.length === 0) {
    return { hero: { ...hero, skillsOwed: 0 }, rng };
  }
  events.push({ type: "skillsOffered", heroId: hero.id, skills: offer });
  return { hero: { ...hero, skillOffer: offer, skillsOwed: hero.skillsOwed - 1 }, rng };
}

/** Герой игрока, которому сейчас нужно выбрать навык. */
export function heroChoosingSkill(state: GameState, player: number): HeroState | undefined {
  return state.heroes.find((hero) => hero.owner === player && hero.skillOffer.length > 0);
}

/** Выбор навыка: герой получает его, а если уровней было несколько — следующее предложение. */
export function applyChooseSkill(state: GameState, command: ChooseSkillCommand): CommandResult {
  const hero = state.heroes.find((candidate) => candidate.id === command.heroId);
  if (hero === undefined) {
    return reject("UNKNOWN_HERO", `Героя «${command.heroId}» нет.`);
  }
  if (hero.owner !== command.player) {
    return reject("NOT_OWNER", "Это чужой герой.");
  }
  if (hero.skillOffer.length === 0) {
    return reject("NO_SKILL_OFFER", "Герою сейчас не из чего выбирать навык.");
  }
  if (!hero.skillOffer.includes(command.skill)) {
    return reject("SKILL_NOT_OFFERED", `Навык «${command.skill}» герою не предложен.`);
  }
  const skills = withSkill(hero.skills, command.skill);
  const events: GameEvent[] = [
    {
      type: "skillLearned",
      heroId: hero.id,
      skill: command.skill,
      level: skills.find((skill) => skill.id === command.skill)?.level ?? 1,
    },
  ];
  const next = offerSkills({ ...hero, skills, skillOffer: [] }, state.rng, events);
  const heroes = state.heroes.map((candidate) =>
    candidate.id === hero.id ? next.hero : candidate,
  );
  return { ok: true, state: { ...state, heroes, rng: next.rng }, events };
}
