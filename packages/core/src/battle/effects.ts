/**
 * Действия заклинаний на отряде: как они меняют скорость, атаку, защиту и урон.
 * Спецификация: docs/mechanics/62-battle-spells.md.
 */
import type { SpellEffect, SpellSchool } from "../spells.ts";
import type { BattleState, StackState, StrikeKind } from "./types.ts";

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
  const raised = stack.creature.speed + sumOf(stack, "speed") + sumOf(stack, "prayer");
  return Math.floor((raised * percentOf(stack, "speedPercent")) / 100);
}

/**
 * Прибавка к атаке: «Жажда крови» — только в ближнем бою, «Точность» — только при стрельбе,
 * «Молитва» и «Слабость» — всегда.
 */
export function attackBonus(stack: Affected, kind: StrikeKind): number {
  const byKind = kind === "shot" ? sumOf(stack, "shotAttack") : sumOf(stack, "meleeAttack");
  return byKind + sumOf(stack, "prayer") - sumOf(stack, "attackDown");
}

/** Прибавка к защите: «Каменная кожа», «Молитва»; «Разрушающий луч» отнимает. */
export function defenseBonus(stack: Affected): number {
  return sumOf(stack, "defense") + sumOf(stack, "prayer") - sumOf(stack, "defenseDown");
}

function valueOf(stack: Affected, effect: SpellEffect): number | null {
  return stack.effects.find((item) => item.effect === effect)?.value ?? null;
}

/** Ослеплён: не ходит (69-spells-control.md). */
export function isBlind(stack: Affected): boolean {
  return valueOf(stack, "blind") !== null;
}

/** Доля ответного удара ослеплённого отряда, в процентах; `null` — не ослеплён. */
export function blindRetaliation(stack: Affected): number | null {
  return valueOf(stack, "blind");
}

/** «Забывчивость»: отряд не может стрелять. */
export function forgotShooting(stack: Affected): boolean {
  return valueOf(stack, "shotDown") === 0;
}

/** «Бешенство»: сколько процентов защиты уходит в атаку; `null` — его нет. */
export function frenzyOf(stack: Affected): number | null {
  return valueOf(stack, "frenzy");
}

/** «Огненный щит»: какая доля урона возвращается ударившему, в процентах; 0 — щита нет. */
export function fireShieldOf(stack: Affected): number {
  return valueOf(stack, "fireShield") ?? 0;
}

/** «Волшебное зеркало»: шанс отразить заклинание, в процентах; 0 — зеркала нет. */
export function mirrorOf(stack: Affected): number {
  return valueOf(stack, "mirror") ?? 0;
}

/** Отряд в берсерке: сам бьёт ближайшего. */
export function isBerserk(stack: Affected): boolean {
  return valueOf(stack, "berserk") !== null;
}

/** Отряд под гипнозом. */
export function isHypnotized(stack: Affected): boolean {
  return valueOf(stack, "hypnosis") !== null;
}

/** Сторона, которая сейчас командует отрядом: под гипнозом — чужая (69-spells-control.md). */
export function commanderOf(stack: Pick<StackState, "effects" | "side">): 0 | 1 {
  if (!isHypnotized(stack)) {
    return stack.side;
  }
  return stack.side === 0 ? 1 : 0;
}

/** «Антимагия»: заклинание круга `level` на отряд не ложится и не задевает его. */
export function immuneTo(stack: Affected, level: number): boolean {
  return (valueOf(stack, "spellImmunity") ?? 0) >= level;
}

const MAX_LUCK = 3;
const MAX_MORALE = 3;

type Sides = Pick<BattleState, "sides">;
type Sided = Pick<StackState, "effects" | "side">;

/** Удача отряда: удача стороны и заклинания; от 0 до 3 (67-spells-plain.md). */
export function luckOf(battle: Sides, stack: Sided): number {
  const raw = battle.sides[stack.side].luck + sumOf(stack, "luck") - sumOf(stack, "luckDown");
  return Math.min(MAX_LUCK, Math.max(0, raw));
}

/** Боевой дух отряда: дух стороны и заклинания; от −3 до 3. */
export function moraleOf(battle: Sides, stack: Sided): number {
  const raw = battle.sides[stack.side].morale + sumOf(stack, "morale") - sumOf(stack, "moraleDown");
  return Math.min(MAX_MORALE, Math.max(-MAX_MORALE, raw));
}

/**
 * Урон одного существа без броска: «Благословение» — наибольший (с навыком школы +1),
 * «Проклятие» — наименьший (с навыком −1, но не меньше 1); иначе `null`.
 */
export function fixedDamage(stack: Pick<StackState, "creature" | "effects">): number | null {
  const bless = stack.effects.find((item) => item.effect === "maxDamage");
  if (bless !== undefined) {
    return stack.creature.damageMax + bless.value;
  }
  const curse = stack.effects.find((item) => item.effect === "minDamage");
  return curse === undefined ? null : Math.max(1, stack.creature.damageMin - curse.value);
}

/**
 * Какая доля урона доходит до отряда, в процентах: «Щит» ослабляет удары ближнего боя,
 * «Воздушный щит» — выстрелы.
 */
export function damagePercent(target: Affected, kind: StrikeKind): number {
  return percentOf(target, kind === "shot" ? "shotDamagePercent" : "meleeDamagePercent");
}

/** То же с «Забывчивостью» на стреляющем: его выстрел слабее. */
export function strikePercent(attacker: Affected, target: Affected, kind: StrikeKind): number {
  const own = kind === "shot" ? (valueOf(attacker, "shotDown") ?? 100) : 100;
  return (damagePercent(target, kind) * own) / 100;
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
