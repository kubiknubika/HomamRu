/**
 * Урон и потери. Спецификация: docs/mechanics/13-battle-damage.md.
 */
import { nextInt } from "../rng.ts";
import type { RngResult, RngState } from "../rng.ts";
import type { CreatureDefinition } from "./types.ts";

const MAX_ROLLS = 10;
const MAX_ATTACK_POINTS = 60;
const MAX_DEFENSE_POINTS = 28;
/** Жребий удачи и высокого боевого духа: «N из 24». */
export const GOOD_DICE = 24;
/** Жребий низкого боевого духа: «N из 12». */
export const BAD_DICE = 12;

/** Базовый урон по готовым броскам: до 10 существ — сумма, больше — сумма × число ÷ 10. */
export function baseDamageOf(rollSum: number, count: number): number {
  return count <= MAX_ROLLS ? rollSum : Math.floor((rollSum * count) / MAX_ROLLS);
}

/** Бросает базовый урон отряда: по броску на существо, но не больше десяти. */
export function rollBaseDamage(
  rng: RngState,
  creature: CreatureDefinition,
  count: number,
): RngResult<number> {
  let current = rng;
  let sum = 0;
  for (let i = 0; i < Math.min(count, MAX_ROLLS); i += 1) {
    const roll = nextInt(current, creature.damageMin, creature.damageMax);
    sum += roll.value;
    current = roll.rng;
  }
  return { value: baseDamageOf(sum, count), rng: current };
}

/**
 * Итоговый урон. Считается в целых числах; дробная часть отбрасывается один раз, в конце.
 * `halvings` — сколько раз урон делится пополам (стрелок в ближнем бою, дальний выстрел).
 */
export function computeDamage(
  base: number,
  attack: number,
  defense: number,
  lucky: boolean,
  halvings: number,
): number {
  const bonusPoints = attack > defense ? Math.min(attack - defense, MAX_ATTACK_POINTS) : 0;
  const reductionPoints = defense > attack ? Math.min(defense - attack, MAX_DEFENSE_POINTS) : 0;
  // (1 + 5 % × очки + 100 % при удаче) = (20 + очки + 20) / 20; (1 − 2,5 % × очки) = (40 − очки) / 40.
  const numerator = base * (20 + bonusPoints + (lucky ? 20 : 0)) * (40 - reductionPoints);
  return Math.max(1, Math.floor(numerator / (800 * 2 ** halvings)));
}

export interface Losses {
  /** Сколько существ осталось; 0 — отряд погиб. */
  readonly count: number;
  readonly firstHealth: number;
  readonly killed: number;
}

/** Вычитает урон из общего здоровья отряда. */
export function applyDamage(
  count: number,
  firstHealth: number,
  health: number,
  damage: number,
): Losses {
  const left = (count - 1) * health + firstHealth - damage;
  if (left <= 0) {
    return { count: 0, firstHealth: 0, killed: count };
  }
  const newCount = Math.ceil(left / health);
  return { count: newCount, firstHealth: left - (newCount - 1) * health, killed: count - newCount };
}

/** Прибавка к защите от «защищаться»: 20 %, дробь отбрасывается, не меньше 1. */
export function defendBonusOf(defense: number): number {
  return Math.max(1, Math.floor(defense / 5));
}
