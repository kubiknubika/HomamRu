import { MINE_KINDS, RESOURCES, validateMap } from "@homamru/core";
import type { GameContent, MapDefinition } from "@homamru/core";
import { z } from "zod";
import { parseContentFile } from "./parse.ts";
import type { ContentResult } from "./parse.ts";

/** Отряд армии: вид существ и их число. Смысл проверяет ядро. */
export const armyStackSchema = z.strictObject({ creature: z.string(), count: z.int() });

/** Объект карты. Описание полей: docs/mechanics/20-map-objects.md. */
const objectSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("pile"),
    x: z.int(),
    y: z.int(),
    resource: z.enum(RESOURCES),
    amount: z.int().optional(),
  }),
  z.strictObject({ type: z.literal("mine"), x: z.int(), y: z.int(), kind: z.enum(MINE_KINDS) }),
  z.strictObject({
    type: z.literal("guard"),
    x: z.int(),
    y: z.int(),
    creature: z.string(),
    count: z.int(),
  }),
  z.strictObject({
    type: z.literal("town"),
    x: z.int(),
    y: z.int(),
    owner: z.int(),
    buildings: z.array(z.string()).optional(),
    garrison: z.array(armyStackSchema).optional(),
  }),
]);

/** Герой в файле карты. Описание полей: docs/mechanics/22-hero.md. */
const heroSchema = z.strictObject({
  name: z.string().optional(),
  x: z.int(),
  y: z.int(),
  attack: z.int().optional(),
  defense: z.int().optional(),
  army: z.array(armyStackSchema),
});

/** Файл карты. Описание полей: docs/mechanics/01-adventure-map.md. */
const mapSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/, "Допустимы строчные латинские буквы, цифры и дефис."),
  name: z.string().min(1),
  terrain: z.array(z.string()),
  players: z.array(
    z.strictObject({
      hero: heroSchema,
      kind: z.enum(["human", "computer"]).optional(),
      resources: z
        .strictObject({
          gold: z.int().optional(),
          wood: z.int().optional(),
          ore: z.int().optional(),
        })
        .optional(),
    }),
  ),
  objects: z.array(objectSchema).optional(),
}) satisfies z.ZodType<MapDefinition>;

/**
 * Разбирает файл карты: сначала по схеме, затем по смыслу — правилами ядра.
 * Контент игры нужен, чтобы проверить армии, охранников, города и имена героев.
 * Ошибка называет файл и место.
 */
export function parseMapFile(
  file: string,
  text: string,
  content: Pick<GameContent, "creatures" | "buildings" | "heroes">,
): ContentResult<MapDefinition> {
  const parsed = parseContentFile(file, text, mapSchema);
  if (!parsed.ok) {
    return parsed;
  }
  const errors = validateMap(parsed.value, content.creatures, content.buildings, content.heroes);
  if (errors.length > 0) {
    return { ok: false, errors: errors.map((error) => ({ file, ...error })) };
  }
  return parsed;
}
