import { BATTLE_REJECT_CODES, MAX_STACKS } from "@homamru/core";
import type {
  BattleDefinition,
  BuildingDefinition,
  CreatureDefinition,
  HeroKind,
  TavernRules,
} from "@homamru/core";
import { z } from "zod";
import { parseContentFile } from "./parse.ts";
import type { ContentResult } from "./parse.ts";

const ID_PATTERN = /^[a-z0-9-]+$/;
const ID_MESSAGE = "Допустимы строчные латинские буквы, цифры и дефис.";

const DAMAGE_ORDER = {
  path: ["damageMin"],
  message: "Урон «от» не может быть больше урона «до».",
};

const creatureFields = {
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
};

/** Файл существа. Описание полей: docs/mechanics/14-creatures.md, 31-recruitment.md. */
const creatureSchema = z
  .strictObject({ ...creatureFields, price: z.int().min(1), growth: z.int().min(1) })
  .refine(
    (creature) => creature.damageMin <= creature.damageMax,
    DAMAGE_ORDER,
  ) satisfies z.ZodType<CreatureDefinition>;

/**
 * Существо в сохранении. Цены и прироста в записях до этапа 4 нет: вместо них 0 — «нет»,
 * и чтение состояния берёт их у существа игры (04-save.md). Незнакомые поля убираются.
 */
export const savedCreatureSchema = z
  .object({
    ...creatureFields,
    price: z.int().min(1).catch(0),
    growth: z.int().min(1).catch(0),
  })
  .refine(
    (creature) => creature.damageMin <= creature.damageMax,
    DAMAGE_ORDER,
  ) satisfies z.ZodType<CreatureDefinition>;

/** Герой в файле героев. Описание: docs/mechanics/32-hero-hire.md. */
export const heroKindSchema = z.strictObject({
  id: z.string().regex(ID_PATTERN, ID_MESSAGE),
  name: z.string().min(1),
  attack: z.int().min(0),
  defense: z.int().min(0),
}) satisfies z.ZodType<HeroKind>;

/** Настройки компьютерного игрока (42-opponent.md). */
export const opponentRulesSchema = z.strictObject({
  advantagePercent: z.int().min(100).max(1000),
  buildOrder: z.array(z.string()),
});

/** Правила таверны: цена героя и его случайная армия (32-hero-hire.md). */
export const tavernRulesSchema = z.strictObject({
  price: z.int().min(1),
  army: z
    .array(
      z
        .strictObject({
          creature: z.string(),
          min: z.int().min(1),
          max: z.int().min(1),
          chance: z.int().min(1).max(100),
        })
        .refine((rule) => rule.min <= rule.max, {
          path: ["min"],
          message: "Число «от» не может быть больше числа «до».",
        }),
    )
    .min(1)
    .max(MAX_STACKS)
    // Хотя бы один отряд есть всегда: герой без армии не бывает.
    .refine((army) => army.some((rule) => rule.chance === 100), {
      message: "Хотя бы у одного отряда должно быть chance: 100.",
    }),
}) satisfies z.ZodType<TavernRules>;

/** Сколько героев нужно игре: герой игрока и двое разных в таверне. */
const MIN_HEROES = 3;

/** Разбирает файл героев: идентификаторы не повторяются, героев хватает на таверну. */
export function parseHeroesFile(file: string, text: string): ContentResult<HeroKind[]> {
  const parsed = parseContentFile(file, text, z.array(heroKindSchema).min(MIN_HEROES));
  if (!parsed.ok) {
    return parsed;
  }
  const ids = parsed.value.map((kind) => kind.id);
  const errors = ids.flatMap((id, index) =>
    ids.indexOf(id) === index
      ? []
      : [{ file, field: `${index}.id`, message: `Герой «${id}» уже есть.` }],
  );
  return errors.length > 0 ? { ok: false, errors } : parsed;
}

const resourceCostSchema = z.strictObject({
  gold: z.int().min(1).optional(),
  wood: z.int().min(1).optional(),
  ore: z.int().min(1).optional(),
});

/** Здание в файле зданий. Описание полей: docs/mechanics/30-town.md. */
export const buildingSchema = z.strictObject({
  id: z.string().regex(ID_PATTERN, ID_MESSAGE),
  name: z.string().min(1),
  cost: resourceCostSchema,
  requires: z.array(z.string()).default([]),
  income: z.int().min(1).optional(),
  growthPercent: z.int().min(1).optional(),
  tavern: z.boolean().optional(),
  dwelling: z.string().optional(),
}) satisfies z.ZodType<BuildingDefinition>;

/**
 * Разбирает файл зданий и проверяет его по смыслу: идентификаторы не повторяются,
 * нужные здания и существа жилищ есть, требования не замкнуты в кольцо, таверна одна.
 */
export function parseBuildingsFile(
  file: string,
  text: string,
  creatures: readonly CreatureDefinition[],
): ContentResult<BuildingDefinition[]> {
  const parsed = parseContentFile(file, text, z.array(buildingSchema).min(1));
  if (!parsed.ok) {
    return parsed;
  }
  const buildings = parsed.value;
  const ids = buildings.map((building) => building.id);
  const errors: { file: string; field: string; message: string }[] = [];
  buildings.forEach((building, index) => {
    if (ids.indexOf(building.id) !== index) {
      errors.push({ file, field: `${index}.id`, message: `Здание «${building.id}» уже есть.` });
    }
    for (const required of building.requires) {
      // Нужное здание стоит в файле раньше: так требования не замкнутся в кольцо.
      if (!ids.slice(0, index).includes(required)) {
        errors.push({
          file,
          field: `${index}.requires`,
          message: `Здания «${required}» выше в файле нет.`,
        });
      }
    }
    const { dwelling } = building;
    if (dwelling !== undefined && !creatures.some((creature) => creature.id === dwelling)) {
      errors.push({ file, field: `${index}.dwelling`, message: `Существа «${dwelling}» нет.` });
    }
  });
  if (buildings.filter((building) => building.tavern === true).length !== 1) {
    errors.push({ file, field: "tavern", message: "Таверна должна быть ровно одна." });
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: buildings };
}

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
