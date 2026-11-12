import { MINE_KINDS, RESOURCES, validateMap } from "@homamru/core";
import type { MapDefinition } from "@homamru/core";
import { z } from "zod";
import { parseContentFile } from "./parse.ts";
import type { ContentResult } from "./parse.ts";

const cellSchema = z.strictObject({ x: z.int(), y: z.int() });

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
]);

/** Файл карты. Описание полей: docs/mechanics/01-adventure-map.md. */
const mapSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/, "Допустимы строчные латинские буквы, цифры и дефис."),
  name: z.string().min(1),
  terrain: z.array(z.string()),
  players: z.array(
    z.strictObject({
      hero: cellSchema,
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
 * Ошибка называет файл и место.
 */
export function parseMapFile(file: string, text: string): ContentResult<MapDefinition> {
  const parsed = parseContentFile(file, text, mapSchema);
  if (!parsed.ok) {
    return parsed;
  }
  const errors = validateMap(parsed.value);
  if (errors.length > 0) {
    return { ok: false, errors: errors.map((error) => ({ file, ...error })) };
  }
  return parsed;
}
