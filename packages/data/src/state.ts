/**
 * Схемы игрового состояния и команд — для данных, пришедших извне: сохранения и дампа.
 * Описание полей: docs/mechanics/00-state-and-commands.md.
 */
import { DIRECTIONS, MINE_KINDS, RESOURCES } from "@homamru/core";
import type { Command, GameState } from "@homamru/core";
import { z } from "zod";

export const gameStateSchema = z.strictObject({
  version: z.int(),
  rng: z.strictObject({ s: z.int() }),
  map: z.strictObject({
    id: z.string(),
    name: z.string(),
    width: z.int(),
    height: z.int(),
    terrain: z.array(z.string()),
  }),
  players: z.array(
    z.strictObject({
      id: z.int(),
      resources: z.strictObject({ gold: z.int(), wood: z.int(), ore: z.int() }),
    }),
  ),
  heroes: z.array(
    z.strictObject({
      id: z.string(),
      owner: z.int(),
      x: z.int(),
      y: z.int(),
      movement: z.int(),
    }),
  ),
  objects: z.array(
    z.discriminatedUnion("type", [
      z.strictObject({
        id: z.string(),
        type: z.literal("pile"),
        x: z.int(),
        y: z.int(),
        resource: z.enum(RESOURCES),
        amount: z.int(),
      }),
      z.strictObject({
        id: z.string(),
        type: z.literal("mine"),
        x: z.int(),
        y: z.int(),
        kind: z.enum(MINE_KINDS),
        owner: z.int().nullable(),
      }),
    ]),
  ),
  day: z.int(),
  currentPlayer: z.int(),
}) satisfies z.ZodType<GameState>;

export const commandSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("moveHero"),
    player: z.int(),
    heroId: z.string(),
    path: z.array(z.enum(DIRECTIONS)),
  }),
  z.strictObject({ type: z.literal("endTurn"), player: z.int() }),
]) satisfies z.ZodType<Command>;
