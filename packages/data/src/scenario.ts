import { BATTLE_REJECT_CODES, DIRECTIONS, REJECT_CODES } from "@homamru/core";
import { z } from "zod";
import { battleStepSchemas } from "./battle.ts";
import { armyStackSchema } from "./map.ts";
import { parseContentFile } from "./parse.ts";
import type { ContentResult } from "./parse.ts";

// Команда боя внутри партии отклоняется с кодом боя (23-map-battle.md).
const expectError = z.enum([...REJECT_CODES, ...BATTLE_REJECT_CODES]).optional();

const stepSchema = z.union([
  z.strictObject({
    move: z.strictObject({ hero: z.string(), path: z.array(z.enum(DIRECTIONS)) }),
    expectError,
  }),
  z.strictObject({ endTurn: z.strictObject({}), expectError }),
  // Шаги боя — те же, что в сценариях боя; команду отдаёт сторона, чей отряд ходит.
  ...battleStepSchemas(expectError),
  /** «Бой до конца»: идущий бой доигрывает простой компьютер за обе стороны. */
  z.strictObject({ fight: z.strictObject({}) }),
]);

/** Файл сценария. Описание: docs/mechanics/05-diagnostics.md. */
const scenarioSchema = z.strictObject({
  name: z.string().min(1),
  /** Идентификатор карты из папки карт. */
  map: z.string().min(1),
  seed: z.int(),
  steps: z.array(stepSchema),
  expect: z
    .strictObject({
      day: z.int().optional(),
      heroes: z
        .record(
          z.string(),
          z.union([
            /** Героя нет на карте: разбит или бежал. */
            z.literal("absent"),
            z.strictObject({
              x: z.int().optional(),
              y: z.int().optional(),
              movement: z.int().optional(),
              experience: z.int().optional(),
              level: z.int().optional(),
              /** Атака плюс защита: что именно выросло с уровнем, решает случай. */
              skills: z.int().optional(),
              army: z.array(armyStackSchema).optional(),
            }),
          ]),
        )
        .optional(),
      /** Запас ресурсов игроков по порядку; проверяются только названные ресурсы. */
      resources: z
        .array(
          z.strictObject({
            gold: z.int().optional(),
            wood: z.int().optional(),
            ore: z.int().optional(),
          }),
        )
        .optional(),
      /**
       * Объекты по идентификатору: `absent` — объекта нет; `owner` — владелец шахты;
       * `count` — число существ у охранника.
       */
      objects: z
        .record(
          z.string(),
          z.union([
            z.literal("absent"),
            z.strictObject({ owner: z.int().nullable() }),
            z.strictObject({ count: z.int() }),
          ]),
        )
        .optional(),
      /** Идёт ли бой в конце сценария. */
      battle: z.boolean().optional(),
      /** Итог партии: `none` — партия идёт. */
      outcome: z.enum(["none", "defeat"]).optional(),
    })
    .optional(),
});

export type Scenario = z.infer<typeof scenarioSchema>;
export type ScenarioStep = z.infer<typeof stepSchema>;

export function parseScenarioFile(file: string, text: string): ContentResult<Scenario> {
  return parseContentFile(file, text, scenarioSchema);
}
