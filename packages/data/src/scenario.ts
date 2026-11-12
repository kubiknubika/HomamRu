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
  // Команды города (30-town.md, 31-recruitment.md); отдаёт игрок, чей ход.
  z.strictObject({
    build: z.strictObject({ town: z.string(), building: z.string() }),
    expectError,
  }),
  z.strictObject({
    recruit: z.strictObject({ town: z.string(), creature: z.string(), count: z.number() }),
    expectError,
  }),
  z.strictObject({
    hireHero: z.strictObject({ town: z.string(), offer: z.number() }),
    expectError,
  }),
  z.strictObject({
    transfer: z.strictObject({
      town: z.string(),
      from: z.enum(["garrison", "hero"]),
      creature: z.string(),
      count: z.number(),
    }),
    expectError,
  }),
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
              /** Идентификатор героя из файла героев. */
              kind: z.string().optional(),
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
       * `count` — число существ у охранника; `buildings`, `available`, `garrison` — город
       * (проверяется только названное).
       */
      objects: z
        .record(
          z.string(),
          z.union([
            z.literal("absent"),
            z.strictObject({ owner: z.int().nullable() }),
            z.strictObject({ count: z.int() }),
            z.strictObject({
              buildings: z.array(z.string()).optional(),
              available: z.array(armyStackSchema).optional(),
              garrison: z.array(armyStackSchema).optional(),
              /** Владелец города: номер игрока с нуля. */
              townOwner: z.int().optional(),
            }),
          ]),
        )
        .optional(),
      /** Идёт ли бой в конце сценария. */
      battle: z.boolean().optional(),
      /** Итог партии: `none` — партия идёт. */
      outcome: z.enum(["none", "defeat", "victory"]).optional(),
      /** Победитель: номер игрока с нуля. */
      winner: z.int().optional(),
      /** Выбывшие игроки: номера с нуля. */
      eliminated: z.array(z.int()).optional(),
    })
    .optional(),
});

export type Scenario = z.infer<typeof scenarioSchema>;
export type ScenarioStep = z.infer<typeof stepSchema>;

export function parseScenarioFile(file: string, text: string): ContentResult<Scenario> {
  return parseContentFile(file, text, scenarioSchema);
}
