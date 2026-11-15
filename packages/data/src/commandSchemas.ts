/** Схема команд партии: журнал команд в записи игры. Вынесено из stateSchemas.ts. */
import { DIRECTIONS, RESOURCES } from "@homamru/core";
import type { Command } from "@homamru/core";
import { z } from "zod";
import { chooseSkillSchema } from "./spells.ts";
import { battleCellSchema, battleSideSchema } from "./stateSchemas.ts";

export const commandSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("moveHero"),
    player: z.int(),
    heroId: z.string(),
    path: z.array(z.enum(DIRECTIONS)),
  }),
  z.strictObject({ type: z.literal("endTurn"), player: z.int() }),
  z.strictObject({
    type: z.literal("hireHero"),
    player: z.int(),
    townId: z.string(),
    offer: z.number(),
  }),
  z.strictObject({
    type: z.literal("build"),
    player: z.int(),
    townId: z.string(),
    building: z.string(),
  }),
  z.strictObject({
    type: z.literal("recruit"),
    player: z.int(),
    townId: z.string(),
    creature: z.string(),
    count: z.number(),
  }),
  z.strictObject({
    type: z.literal("transfer"),
    player: z.int(),
    townId: z.string(),
    from: z.enum(["garrison", "hero"]),
    creature: z.string(),
    count: z.number(),
  }),
  z.strictObject({ type: z.literal("buyBook"), player: z.int(), townId: z.string() }),
  z.strictObject({
    type: z.literal("trade"),
    player: z.int(),
    townId: z.string(),
    give: z.enum(RESOURCES),
    want: z.enum(RESOURCES),
    count: z.number(),
  }),
  chooseSkillSchema,
  z.strictObject({
    type: z.literal("battleCast"),
    side: battleSideSchema,
    spell: z.string(),
    target: z.string().optional(),
    cell: battleCellSchema.optional(),
    victim: z.string().optional(),
  }),
  z.strictObject({ type: z.literal("battleMove"), side: battleSideSchema, to: battleCellSchema }),
  z.strictObject({
    type: z.literal("battleAttack"),
    side: battleSideSchema,
    target: z.string(),
    from: battleCellSchema,
  }),
  z.strictObject({ type: z.literal("battleShoot"), side: battleSideSchema, target: z.string() }),
  z.strictObject({ type: z.literal("battleWait"), side: battleSideSchema }),
  z.strictObject({ type: z.literal("battleDefend"), side: battleSideSchema }),
  z.strictObject({ type: z.literal("battleFlee"), side: battleSideSchema }),
]) satisfies z.ZodType<Command>;
