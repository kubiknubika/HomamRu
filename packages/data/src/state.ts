/**
 * Схемы игрового состояния и команд — для данных, пришедших извне: сохранения и дампа.
 * Описание полей: docs/mechanics/00-state-and-commands.md.
 */
import { DIRECTIONS } from "@homamru/core";
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
  players: z.array(z.strictObject({ id: z.int() })),
  heroes: z.array(
    z.strictObject({
      id: z.string(),
      owner: z.int(),
      x: z.int(),
      y: z.int(),
      movement: z.int(),
    }),
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
