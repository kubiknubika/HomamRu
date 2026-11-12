/**
 * Проверка карты по смыслу: армии героев и охранники.
 * Спецификации: docs/mechanics/20-map-objects.md, 21-guards.md, 22-hero.md.
 */
import type { HeroKind } from "./tavernTypes.ts";
import { MAX_STACKS } from "./battle/types.ts";
import type { CreatureDefinition } from "./battle/types.ts";
import { GUARD_MAX_COUNT } from "./guards.ts";
import type { ArmyStack, MapDefinition } from "./types.ts";

interface ContentError {
  readonly field: string;
  readonly message: string;
}

function isCount(value: number, min: number): boolean {
  return Number.isInteger(value) && value >= min;
}

function armyErrors(
  field: string,
  army: readonly ArmyStack[],
  known: ReadonlySet<string>,
): ContentError[] {
  const errors: ContentError[] = [];
  if (army.length < 1 || army.length > MAX_STACKS) {
    errors.push({
      field,
      message: `Отрядов в армии ${army.length}; допустимо от 1 до ${MAX_STACKS}.`,
    });
  }
  army.forEach((stack, index) => {
    if (!known.has(stack.creature)) {
      errors.push({
        field: `${field}.${index}.creature`,
        message: `Существа «${stack.creature}» нет.`,
      });
    }
    if (!isCount(stack.count, 1)) {
      errors.push({
        field: `${field}.${index}.count`,
        message: `Существ ${stack.count}; должно быть целое, не меньше 1.`,
      });
    }
  });
  return errors;
}

/** Ошибки в героях и охранниках карты. Пустой список — всё верно. */
export function contentErrors(
  map: MapDefinition,
  creatures: readonly CreatureDefinition[],
  heroes: readonly HeroKind[] = [],
): ContentError[] {
  const known = new Set(creatures.map((creature) => creature.id));
  const errors: ContentError[] = [];
  map.players.forEach((player, index) => {
    const field = `players.${index}.hero`;
    const { attack = 0, defense = 0, army, name } = player.hero;
    if (name !== undefined && !heroes.some((kind) => kind.id === name)) {
      errors.push({ field: `${field}.name`, message: `Героя «${name}» нет.` });
    }
    if (!isCount(attack, 0) || !isCount(defense, 0)) {
      errors.push({ field, message: "Атака и защита героя — целые, не меньше 0." });
    }
    errors.push(...armyErrors(`${field}.army`, army, known));
  });
  (map.objects ?? []).forEach((object, index) => {
    if (object.type !== "guard") {
      return;
    }
    const field = `objects.${index}`;
    if (!known.has(object.creature)) {
      errors.push({ field, message: `Существа «${object.creature}» нет.` });
    }
    if (!isCount(object.count, 1) || object.count > GUARD_MAX_COUNT) {
      errors.push({
        field,
        message: `Существ ${object.count}; допустимо от 1 до ${GUARD_MAX_COUNT}.`,
      });
    }
    for (const [player, { hero }] of map.players.entries()) {
      if (Math.max(Math.abs(hero.x - object.x), Math.abs(hero.y - object.y)) === 1) {
        errors.push({
          field,
          message: `Герой игрока ${player + 1} начинает рядом с охранником: клетка (${hero.x}, ${hero.y}).`,
        });
      }
    }
  });
  return errors;
}
