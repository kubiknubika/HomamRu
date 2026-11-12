/**
 * Начальные значения, которые берутся из контента игры, а не из кода: существа и армия героя.
 * Ими дополняется сохранение другой версии (docs/mechanics/04-save.md, «Сохранения других версий»).
 */
import { MAX_STACKS } from "@homamru/core";
import type { ArmyStack, GameContent } from "@homamru/core";
import { z } from "zod";
import { opponentRulesSchema, tavernRulesSchema } from "./battle.ts";
import { armyStackSchema } from "./map.ts";
import { parseContentFile } from "./parse.ts";
import type { ContentResult } from "./parse.ts";

/** Контент игры и то, чем дополняется сохранение другой версии. */
export interface SaveDefaults extends GameContent {
  /** Армия героя, у которого в сохранении армии нет. */
  readonly heroArmy: readonly ArmyStack[];
}

/** Файл начальных значений: `data/defaults.yaml`. */
const defaultsSchema = z.strictObject({
  heroArmy: z
    .array(armyStackSchema.extend({ count: z.int().min(1) }))
    .min(1)
    .max(MAX_STACKS),
  tavern: tavernRulesSchema,
  opponent: opponentRulesSchema,
});

/**
 * Разбирает файл начальных значений и собирает контент игры целиком.
 * Существа армии героя и армии таверны должны быть среди существ игры,
 * здания из порядка стройки компьютера — среди зданий игры.
 */
export function parseDefaultsFile(
  file: string,
  text: string,
  content: Omit<GameContent, "tavern" | "opponent">,
): ContentResult<SaveDefaults> {
  const parsed = parseContentFile(file, text, defaultsSchema);
  if (!parsed.ok) {
    return parsed;
  }
  const known = new Set(content.creatures.map((creature) => creature.id));
  const { heroArmy, tavern, opponent } = parsed.value;
  const stacks = [
    ...heroArmy.map((stack, index) => ({ ...stack, field: `heroArmy.${index}.creature` })),
    ...tavern.army.map((rule, index) => ({ ...rule, field: `tavern.army.${index}.creature` })),
  ];
  const errors = stacks.flatMap((stack) =>
    known.has(stack.creature)
      ? []
      : [{ file, field: stack.field, message: `Существа «${stack.creature}» нет.` }],
  );
  for (const [index, id] of opponent.buildOrder.entries()) {
    if (!content.buildings.some((building) => building.id === id)) {
      errors.push({ file, field: `opponent.buildOrder.${index}`, message: `Здания «${id}» нет.` });
    }
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, value: { ...content, tavern, opponent, heroArmy } };
}
