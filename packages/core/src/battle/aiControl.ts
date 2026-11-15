/**
 * Компьютер и заклинания управления отрядом: чего стоит действие на отряде.
 * Спецификация: docs/mechanics/69-spells-control.md.
 */
import type { SpellEffect } from "../spells.ts";
import { HEALTH } from "./aiArea.ts";
import { spellValue } from "./cast.ts";
import { distance } from "./hex.ts";
import type { BattleSide, BattleState, StackState } from "./types.ts";

const PERCENT = 100;
/** Очко атаки — 5 % урона, очко защиты — 2,5 % (13-battle-damage.md). */
const ATTACK_POINT_X2 = 10;
const DEFENSE_POINT_X2 = 5;

/** Средний урон удара отряда, в единицах пользы; поправки на атаку и защиту нет — цель неизвестна. */
export function strikeOf(stack: StackState): number {
  const { damageMin, damageMax } = stack.creature;
  return ((damageMin + damageMax) * stack.count * HEALTH) / 2;
}

export function isMelee(stack: StackState): boolean {
  return stack.shots === 0;
}

export function strongest(stacks: readonly StackState[]): number {
  return Math.max(0, ...stacks.map(strikeOf));
}

function healthOf(stack: StackState): number {
  return (stack.count - 1) * stack.creature.health + stack.firstHealth;
}

/**
 * Польза действия управления на отряде `stack` на `rounds` раундов; `undefined` — действие не из этой группы.
 * `foes` — живые отряды, враждебные отряду.
 */
export function controlWorth(
  state: BattleState,
  stack: StackState,
  foes: readonly StackState[],
  effect: { readonly effect: SpellEffect; readonly value: number },
  rounds: number,
): number | undefined {
  const strike = strikeOf(stack);
  const near = foes.filter((foe) => distance(foe, stack) === 1).length;
  switch (effect.effect) {
    case "blind":
      // Отряд пропускает ход; дольше раунда слепота держится редко — её снимает первый же урон.
      return strike;
    case "shotDown":
      return isMelee(stack) ? 0 : (strike * (PERCENT - effect.value) * rounds) / PERCENT;
    case "frenzy": {
      // Один удар сильнее на долю защиты; до него враг бьёт по защите 0.
      const hero = state.sides[stack.side].hero?.defense ?? 0;
      const defense = stack.creature.defense + hero;
      const gain =
        (strike * Math.floor((defense * effect.value) / PERCENT) * ATTACK_POINT_X2) / (2 * PERCENT);
      const loss = (strongest(foes) * defense * DEFENSE_POINT_X2) / (2 * PERCENT);
      return gain - loss;
    }
    case "retaliations":
      // Лишний ответ нужен, когда бьют двое и больше.
      return strike * Math.min(effect.value, Math.max(0, near - 1));
    case "hypnosis":
      // У врага отрядом меньше, у нас — больше.
      return 2 * strike * rounds;
    case "fireShield":
      return (strongest(foes.filter(isMelee)) * effect.value * rounds) / PERCENT;
    default:
      return undefined;
  }
}

/**
 * Польза «Антимагии» на отряде: сильнейшее заклинание урона вражеского героя из тех кругов,
 * от которых она закроет; сверх здоровья отряда не считается.
 */
export function immunityWorth(
  state: BattleState,
  enemy: BattleSide,
  target: StackState,
  maxLevel: number,
): number {
  const hero = state.sides[enemy].hero;
  if (hero === null) {
    return 0;
  }
  const damages = hero.spells
    .filter((item) => item.effect === "damage" && item.cost <= hero.mana && item.level <= maxLevel)
    .map((item) => spellValue(item, hero));
  return Math.min(Math.max(0, ...damages), healthOf(target)) * HEALTH;
}
