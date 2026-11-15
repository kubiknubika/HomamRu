/**
 * Заклинания: описание и набор гильдии магов.
 * Спецификации: docs/mechanics/60-spells.md, 61-magic.md.
 */
import { nextInt } from "./rng.ts";
import type { RngResult, RngState } from "./rng.ts";

export const SPELL_SCHOOLS = ["earth", "water", "fire", "air"] as const;
export type SpellSchool = (typeof SPELL_SCHOOLS)[number];

/**
 * Что делает заклинание (62-battle-spells.md):
 * `damage` — урон; `heal` — лечит и снимает вредные действия; `dispel` — снимает все действия;
 * остальные — действие на несколько раундов (67-spells-plain.md): `shotAttack` — атака при стрельбе,
 * `attackDown` и `defenseDown` — меньше атака и защита, `shotDamagePercent` — доля урона выстрела,
 * `prayer` — атака, защита и скорость, `luck`/`luckDown`, `morale`/`moraleDown` — удача и боевой дух отряда.
 */
export const SPELL_EFFECTS = [
  "damage",
  "heal",
  "dispel",
  "maxDamage",
  "minDamage",
  "meleeAttack",
  "defense",
  "speed",
  "speedPercent",
  "meleeDamagePercent",
  "spellDamagePercent",
  "shotAttack",
  "attackDown",
  "defenseDown",
  "shotDamagePercent",
  "prayer",
  "luck",
  "luckDown",
  "morale",
  "moraleDown",
] as const;
export type SpellEffect = (typeof SPELL_EFFECTS)[number];

export const SPELL_AREAS = ["ball", "ring", "inferno", "all", "chain"] as const;
type SpellArea = (typeof SPELL_AREAS)[number];

/**
 * Заклинание: то же, что в файле заклинаний. `cost` и `value` — для героя без навыка школы;
 * числа с навыком — `skilledCost` и `values` (65-hero-skills.md).
 */
export interface SpellDefinition {
  readonly id: string;
  readonly name: string;
  /** Круг, от 1 до 5: гильдия магов уровня N даёт заклинания круга N. */
  readonly level: number;
  readonly schools: readonly SpellSchool[];
  /** Цена в мане. */
  readonly cost: number;
  /** Цена в мане с навыком школы любого уровня. */
  readonly skilledCost: number;
  /** Множитель силы магии героя: у урона и лечения. */
  readonly power: number;
  /** Прибавка к урону и лечению либо величина действия. */
  readonly value: number;
  /** То же число на базовом, продвинутом и экспертном уровне навыка школы. */
  readonly values: readonly [number, number, number];
  /** На экспертном уровне ложится на все подходящие отряды. */
  readonly expertMass: boolean;
  /** С продвинутого уровня ложится на любой отряд, и на чужой («Снять заклинания»). */
  readonly advancedAnyTarget: boolean;
  /**
   * Ложится на все подходящие отряды. В файле заклинаний этого поля нет: его ставит
   * `spellAtMastery`, когда герой входит в бой.
   */
  readonly mass?: boolean | undefined;
  /** Вес при выборе набора гильдии; 0 — в гильдии не бывает. */
  readonly chance: number;
  readonly effect: SpellEffect;
  /** На кого накладывается: на чужой отряд, на свой или на любой. */
  readonly target: "enemy" | "ally" | "any";
  /** Для `spellDamagePercent`: от какой школы защищает. */
  readonly protects?: SpellSchool | undefined;
  /** Действует до конца боя и складывается с собой («Разрушающий луч»). */
  readonly cumulative?: boolean | undefined;
  /** Не действует на катапульту и башни («Взрыв»). */
  readonly spareMachines?: boolean | undefined;
  /**
   * Урон по площади (68-spells-area.md): `ball` — клетка и соседние, `ring` — только соседние,
   * `inferno` — два шага, `all` — все отряды, `chain` — цепь ближайших отрядов.
   */
  readonly area?: SpellArea | undefined;
  /** Для `chain`: сколько отрядов в цепи без навыка, на базовом, продвинутом и экспертном уровне. */
  readonly chain?: readonly [number, number, number, number] | undefined;
  /** Длина цепи у героя; в файле заклинаний этого поля нет: его ставит `spellAtMastery`. */
  readonly chainLength?: number | undefined;
  /** Заклинания, действие которых это заклинание снимает. */
  readonly counters: readonly string[];
}

/**
 * Заклинание таким, каким его колдует герой с уровнем школы `mastery` (0 — без навыка):
 * цена, число и цели уже с учётом навыка. Таким оно хранится в состоянии боя.
 */
export function spellAtMastery(spell: SpellDefinition, mastery: number): SpellDefinition {
  const chain =
    spell.chain === undefined
      ? {}
      : { chainLength: spell.chain[Math.min(Math.max(mastery, 0), 3)] };
  if (mastery <= 0) {
    return { ...spell, mass: false, ...chain };
  }
  return {
    ...spell,
    ...chain,
    cost: spell.skilledCost,
    value: spell.values[Math.min(mastery, spell.values.length) - 1] ?? spell.value,
    mass: mastery >= 3 && spell.expertMass,
    target: mastery >= 2 && spell.advancedAnyTarget ? "any" : spell.target,
  };
}

/** Наибольший круг заклинаний. */
const MAX_SPELL_LEVEL = 5;

/** Сколько заклинаний своего круга даёт гильдия уровня `level`: 5, 4, 3, 2, 1. */
export function guildSlots(level: number): number {
  return MAX_SPELL_LEVEL + 1 - level;
}

/**
 * Набор гильдии города на все круги: в каждом круге — жребий по весам без повторов.
 * Заклинания с весом 0 не выпадают. В ответе — идентификаторы по кругам, по порядку жребия.
 */
export function rollGuildSpells(
  initial: RngState,
  spells: readonly SpellDefinition[],
): RngResult<string[]> {
  let rng = initial;
  const chosen: string[] = [];
  for (let level = 1; level <= MAX_SPELL_LEVEL; level += 1) {
    const pool = spells.filter((spell) => spell.level === level && spell.chance > 0);
    for (let slot = 0; slot < guildSlots(level) && pool.length > 0; slot += 1) {
      const total = pool.reduce((sum, spell) => sum + spell.chance, 0);
      const roll = nextInt(rng, 1, total);
      ({ rng } = roll);
      let left = roll.value;
      const index = pool.findIndex((spell) => {
        left -= spell.chance;
        return left <= 0;
      });
      chosen.push(...pool.splice(index, 1).map((spell) => spell.id));
    }
  }
  return { value: chosen, rng };
}
