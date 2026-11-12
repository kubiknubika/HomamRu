import { BATTLE_REJECT_CODES } from "@homamru/core";
import type { BattleDefinition, CreatureDefinition } from "@homamru/core";
import { z } from "zod";
import { parseContentFile } from "./parse.ts";
import type { ContentResult } from "./parse.ts";

const ID_PATTERN = /^[a-z0-9-]+$/;
const ID_MESSAGE = "Допустимы строчные латинские буквы, цифры и дефис.";

/** Файл существа. Описание полей: docs/mechanics/14-creatures.md. */
export const creatureSchema = z
  .strictObject({
    id: z.string().regex(ID_PATTERN, ID_MESSAGE),
    name: z.string().min(1),
    attack: z.int().min(0),
    defense: z.int().min(0),
    damageMin: z.int().min(1),
    damageMax: z.int().min(1),
    health: z.int().min(1),
    speed: z.int().min(1),
    flying: z.boolean(),
    shots: z.int().min(0),
  })
  .refine((creature) => creature.damageMin <= creature.damageMax, {
    path: ["damageMin"],
    message: "Урон «от» не может быть больше урона «до».",
  }) satisfies z.ZodType<CreatureDefinition>;

export function parseCreatureFile(file: string, text: string): ContentResult<CreatureDefinition> {
  return parseContentFile(file, text, creatureSchema);
}

/** Клетка поля боя в файле: пара [столбец, ряд]. */
const cellSchema = z.tuple([z.int(), z.int()]).transform(([col, row]) => ({ col, row }));

const armySchema = z.strictObject({
  hero: z.strictObject({ attack: z.int().min(0), defense: z.int().min(0) }).optional(),
  morale: z.int(),
  luck: z.int(),
  army: z.array(z.strictObject({ creature: z.string(), count: z.int() })),
});

/** Файл боя. Описание: docs/mechanics/10-battle-field.md. Смысл проверяет ядро при создании боя. */
const battleSchema = z.strictObject({
  id: z.string().regex(ID_PATTERN, ID_MESSAGE),
  name: z.string().min(1),
  obstacles: z.array(cellSchema),
  attacker: armySchema,
  defender: armySchema,
});

export function parseBattleFile(file: string, text: string): ContentResult<BattleDefinition> {
  return parseContentFile(file, text, battleSchema);
}

const nothing = z.strictObject({});

/** Шаги боя в сценарии; `expectError` — какие отказы можно ожидать. */
export function battleStepSchemas<E extends z.ZodType>(expectError: E) {
  return [
    z.strictObject({ move: cellSchema, expectError }),
    z.strictObject({
      attack: z.strictObject({ target: z.string(), from: cellSchema }),
      expectError,
    }),
    z.strictObject({ shoot: z.string(), expectError }),
    z.strictObject({ wait: nothing, expectError }),
    z.strictObject({ defend: nothing, expectError }),
    z.strictObject({ flee: nothing, expectError }),
  ] as const;
}

const stepSchema = z.union(battleStepSchemas(z.enum(BATTLE_REJECT_CODES).optional()));

/** Файл сценария боя. Описание: docs/mechanics/16-battle-screen.md. */
const battleScenarioSchema = z.strictObject({
  name: z.string().min(1),
  /** Идентификатор боя из папки боёв. */
  battle: z.string().min(1),
  seed: z.int(),
  steps: z.array(stepSchema),
  expect: z
    .strictObject({
      winner: z.enum(["attacker", "defender"]).optional(),
      /** Ход какого отряда ожидается в конце. */
      active: z.string().optional(),
      stacks: z
        .record(
          z.string(),
          z.strictObject({
            count: z.int().optional(),
            cell: cellSchema.optional(),
            shots: z.int().optional(),
          }),
        )
        .optional(),
    })
    .optional(),
});

export type BattleScenario = z.infer<typeof battleScenarioSchema>;
export type BattleScenarioStep = z.infer<typeof stepSchema>;

export function parseBattleScenarioFile(file: string, text: string): ContentResult<BattleScenario> {
  return parseContentFile(file, text, battleScenarioSchema);
}
