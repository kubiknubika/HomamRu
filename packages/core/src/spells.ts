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
 * остальные — действие на несколько раундов.
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
] as const;
export type SpellEffect = (typeof SPELL_EFFECTS)[number];

/** Заклинание: то же, что в файле заклинаний. Числа — для героя без навыка школы. */
export interface SpellDefinition {
  readonly id: string;
  readonly name: string;
  /** Круг, от 1 до 5: гильдия магов уровня N даёт заклинания круга N. */
  readonly level: number;
  readonly schools: readonly SpellSchool[];
  /** Цена в мане. */
  readonly cost: number;
  /** Множитель силы магии героя: у урона и лечения. */
  readonly power: number;
  /** Прибавка к урону и лечению либо величина действия. */
  readonly value: number;
  /** Вес при выборе набора гильдии; 0 — в гильдии не бывает. */
  readonly chance: number;
  readonly effect: SpellEffect;
  /** На кого накладывается: на чужой отряд или на свой. */
  readonly target: "enemy" | "ally";
  /** Для `spellDamagePercent`: от какой школы защищает. */
  readonly protects?: SpellSchool | undefined;
  /** Заклинания, действие которых это заклинание снимает. */
  readonly counters: readonly string[];
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
