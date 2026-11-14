/**
 * Действия заклинаний на отряде: как они меняют скорость, атаку, защиту и урон.
 * Спецификация: docs/mechanics/62-battle-spells.md.
 */
import type { SpellEffect, SpellSchool } from "../spells.ts";
import type { StackState, StrikeKind } from "./types.ts";

type Affected = Pick<StackState, "effects">;

function sumOf(stack: Affected, effect: SpellEffect): number {
  return stack.effects.reduce((sum, item) => sum + (item.effect === effect ? item.value : 0), 0);
}

function percentOf(stack: Affected, effect: SpellEffect, school?: SpellSchool): number {
  const found = stack.effects.find(
    (item) => item.effect === effect && (school === undefined || item.school === school),
  );
  return found?.value ?? 100;
}

/** Скорость отряда с «Ускорением» и «Замедлением»; дробь отбрасывается. */
export function speedOf(stack: Pick<StackState, "creature" | "effects">): number {
  const raised = stack.creature.speed + sumOf(stack, "speed");
  return Math.floor((raised * percentOf(stack, "speedPercent")) / 100);
}

/** Прибавка к атаке: «Жажда крови» действует только в ближнем бою. */
export function attackBonus(stack: Affected, kind: StrikeKind): number {
  return kind === "shot" ? 0 : sumOf(stack, "meleeAttack");
}

/** Прибавка к защите: «Каменная кожа». */
export function defenseBonus(stack: Affected): number {
  return sumOf(stack, "defense");
}

/** «Благословение» — урон всегда наибольший, «Проклятие» — наименьший; иначе `null`. */
export function fixedDamage(stack: Affected): "max" | "min" | null {
  if (stack.effects.some((item) => item.effect === "maxDamage")) {
    return "max";
  }
  return stack.effects.some((item) => item.effect === "minDamage") ? "min" : null;
}

/** Какая доля урона доходит до отряда, в процентах: «Щит» ослабляет удары ближнего боя. */
export function damagePercent(target: Affected, kind: StrikeKind): number {
  return kind === "shot" ? 100 : percentOf(target, "meleeDamagePercent");
}

/**
 * Какая доля урона заклинания доходит до отряда, в процентах.
 * У заклинания нескольких школ считается защита только от одной — первой найденной.
 */
export function spellDamagePercent(target: Affected, schools: readonly SpellSchool[]): number {
  for (const school of schools) {
    const percent = percentOf(target, "spellDamagePercent", school);
    if (percent !== 100) {
      return percent;
    }
  }
  return 100;
}
