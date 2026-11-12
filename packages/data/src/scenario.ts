import { DIRECTIONS, REJECT_CODES } from "@homamru/core";
import { z } from "zod";
import { parseContentFile } from "./parse.ts";
import type { ContentResult } from "./parse.ts";

const expectError = z.enum(REJECT_CODES).optional();

const stepSchema = z.union([
  z.strictObject({
    move: z.strictObject({ hero: z.string(), path: z.array(z.enum(DIRECTIONS)) }),
    expectError,
  }),
  z.strictObject({ endTurn: z.strictObject({}), expectError }),
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
          z.strictObject({ x: z.int(), y: z.int(), movement: z.int().optional() }),
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
      /** Объекты по идентификатору: `absent` — объекта нет; `owner` — владелец шахты. */
      objects: z
        .record(
          z.string(),
          z.union([z.literal("absent"), z.strictObject({ owner: z.int().nullable() })]),
        )
        .optional(),
    })
    .optional(),
});

export type Scenario = z.infer<typeof scenarioSchema>;
export type ScenarioStep = z.infer<typeof stepSchema>;

export function parseScenarioFile(file: string, text: string): ContentResult<Scenario> {
  return parseContentFile(file, text, scenarioSchema);
}
