/**
 * Начальные значения, которые берутся из контента игры, а не из кода: существа и армия героя.
 * Ими дополняется сохранение другой версии (docs/mechanics/04-save.md, «Сохранения других версий»).
 */
import { MAX_STACKS } from "@homamru/core";
import type { ArmyStack, BuildingDefinition, CreatureDefinition } from "@homamru/core";
import { z } from "zod";
import { armyStackSchema } from "./map.ts";
import { parseContentFile } from "./parse.ts";
import type { ContentResult } from "./parse.ts";

export interface SaveDefaults {
  /** Существа игры: ими дополняется список существ партии. */
  readonly creatures: readonly CreatureDefinition[];
  /** Здания игры: ими дополняется список зданий партии. */
  readonly buildings: readonly BuildingDefinition[];
  /** Армия героя, у которого в сохранении армии нет. */
  readonly heroArmy: readonly ArmyStack[];
}

/** Файл начальных значений: `data/defaults.yaml`. */
const defaultsSchema = z.strictObject({
  heroArmy: z
    .array(armyStackSchema.extend({ count: z.int().min(1) }))
    .min(1)
    .max(MAX_STACKS),
});

/** Разбирает файл начальных значений; существа армии должны быть среди существ игры. */
export function parseDefaultsFile(
  file: string,
  text: string,
  creatures: readonly CreatureDefinition[],
  buildings: readonly BuildingDefinition[],
): ContentResult<SaveDefaults> {
  const parsed = parseContentFile(file, text, defaultsSchema);
  if (!parsed.ok) {
    return parsed;
  }
  const known = new Set(creatures.map((creature) => creature.id));
  const errors = parsed.value.heroArmy.flatMap((stack, index) =>
    known.has(stack.creature)
      ? []
      : [
          {
            file,
            field: `heroArmy.${index}.creature`,
            message: `Существа «${stack.creature}» нет.`,
          },
        ],
  );
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, value: { creatures, buildings, heroArmy: parsed.value.heroArmy } };
}
