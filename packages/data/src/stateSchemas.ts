/**
 * Схемы частей игрового состояния и команд — для данных, пришедших извне.
 * Части состояния читаются терпимо (docs/mechanics/04-save.md, «Сохранения других версий»):
 * обычный `z.object` молча убирает незнакомые поля, `.catch` подставляет начальное значение.
 * Идущий бой читается строго: он либо цел, либо убирается.
 */
import {
  DAILY_MOVEMENT,
  DIRECTIONS,
  GUARD_MAX_COUNT,
  MAX_PLAYERS,
  MINE_KINDS,
  RESOURCES,
} from "@homamru/core";
import type { BattleState, Command } from "@homamru/core";
import { z } from "zod";
import { savedCreatureSchema } from "./battle.ts";

/**
 * Начальные значения параметров состояния — те, что вписываются, когда в записи их нет.
 * Новый параметр состояния обязан получить значение здесь и строку в таблице 04-save.md.
 * Армия героя и существа — из контента игры: `SaveDefaults` в defaults.ts.
 */
export const DEFAULTS = {
  rng: 0,
  mapId: "unknown",
  mapName: "Без названия",
  resource: 0,
  movement: DAILY_MOVEMENT,
  heroAttack: 0,
  heroDefense: 0,
  heroExperience: 0,
  mineOwner: null,
  day: 1,
  currentPlayer: 0,
  battle: null,
  outcome: null,
} as const;

export const NO_RESOURCES = {
  gold: DEFAULTS.resource,
  wood: DEFAULTS.resource,
  ore: DEFAULTS.resource,
} as const;

const UINT32_MAX = 0xff_ff_ff_ff;

const amountSchema = z.int().min(0).catch(DEFAULTS.resource);
const playerNumberSchema = z
  .int()
  .min(0)
  .max(MAX_PLAYERS - 1);

const playerSchema = z.object({
  resources: z
    .object({ gold: amountSchema, wood: amountSchema, ore: amountSchema })
    .catch(NO_RESOURCES),
  // Таверна сверяется с героями и существами партии при чтении (stateTavern.ts).
  tavern: z.unknown().optional(),
});

export const objectSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string(),
    type: z.literal("pile"),
    x: z.int(),
    y: z.int(),
    resource: z.enum(RESOURCES),
    amount: z.int().min(1),
  }),
  z.object({
    id: z.string(),
    type: z.literal("mine"),
    x: z.int(),
    y: z.int(),
    kind: z.enum(MINE_KINDS),
    owner: playerNumberSchema.nullable().catch(DEFAULTS.mineOwner),
  }),
  z.object({
    id: z.string(),
    type: z.literal("guard"),
    x: z.int(),
    y: z.int(),
    creature: z.string(),
    count: z.int().min(1).max(GUARD_MAX_COUNT),
    // Сила сверяется с числом существ при чтении; 0 — «нет».
    power: z.int().min(0).catch(0),
  }),
  z.object({
    id: z.string(),
    type: z.literal("town"),
    x: z.int(),
    y: z.int(),
    owner: playerNumberSchema,
    // Списки сверяются со зданиями и существами партии при чтении (stateTown.ts).
    buildings: z.array(z.string()).catch([]),
    builtToday: z.boolean().catch(false),
    available: z.array(z.unknown()).catch([]),
    garrison: z.array(z.unknown()).catch([]),
  }),
]);

export const cellSchema = z.object({ x: z.int(), y: z.int() });

/** Отряд армии героя: знакомо ли существо, проверяется при чтении. */
export const armyStackSchema = z.object({ creature: z.string(), count: z.int().min(1) });

/** Герой, о котором в записи ничего нет: всё берётся начальное. */
export const NO_HERO = {
  id: undefined,
  owner: undefined,
  kind: undefined,
  name: undefined,
  x: undefined,
  y: undefined,
  movement: DEFAULTS.movement,
  attack: DEFAULTS.heroAttack,
  defense: DEFAULTS.heroDefense,
  experience: DEFAULTS.heroExperience,
  army: [],
} as const;

export const heroSchema = z.object({
  id: z.string().optional().catch(undefined),
  owner: playerNumberSchema.optional().catch(undefined),
  kind: z.string().optional().catch(undefined),
  name: z.string().optional().catch(undefined),
  x: z.int().optional().catch(undefined),
  y: z.int().optional().catch(undefined),
  movement: z.int().min(0).catch(DEFAULTS.movement),
  attack: z.int().min(0).catch(DEFAULTS.heroAttack),
  defense: z.int().min(0).catch(DEFAULTS.heroDefense),
  experience: z.int().min(0).catch(DEFAULTS.heroExperience),
  army: z.array(z.unknown()).catch([]),
});

/** Первый проход: поля по одному. Что зависит от соседних полей, доделывает `readState`. */
export const looseStateSchema = z.object({
  rng: z
    .object({ s: z.int().min(0).max(UINT32_MAX).catch(DEFAULTS.rng) })
    .catch({ s: DEFAULTS.rng }),
  map: z.object({
    id: z.string().catch(DEFAULTS.mapId),
    name: z.string().catch(DEFAULTS.mapName),
    // Начального значения нет: без местности партию не продолжить.
    terrain: z.array(z.string().min(1)).min(1),
    starts: z.array(z.unknown()).catch([]),
  }),
  players: z.array(playerSchema.catch({ resources: NO_RESOURCES })).catch([]),
  heroes: z.array(z.unknown()).catch([]),
  objects: z.array(z.unknown()).catch([]),
  day: z.int().min(1).catch(DEFAULTS.day),
  currentPlayer: z.int().min(0).catch(DEFAULTS.currentPlayer),
  creatures: z.array(z.unknown()).catch([]),
  buildings: z.array(z.unknown()).catch([]),
  heroKinds: z.unknown().optional(),
  tavern: z.unknown().optional(),
  battle: z.unknown().optional(),
  outcome: z.literal("defeat").nullable().catch(DEFAULTS.outcome),
});

export type LooseState = z.infer<typeof looseStateSchema>;

const battleCellSchema = z.strictObject({ col: z.int(), row: z.int() });
const battleSideSchema = z.union([z.literal(0), z.literal(1)]);

const battleSideStateSchema = z.strictObject({
  hero: z.strictObject({ attack: z.int(), defense: z.int() }).nullable(),
  morale: z.int(),
  luck: z.int(),
});

/** Состояние боя целиком. Описание полей: docs/mechanics/10-battle-field.md … 13. */
const battleStateSchema = z.strictObject({
  version: z.int(),
  rng: z.strictObject({ s: z.int() }),
  round: z.int(),
  obstacles: z.array(battleCellSchema),
  sides: z.tuple([battleSideStateSchema, battleSideStateSchema]),
  stacks: z.array(
    z.strictObject({
      id: z.string(),
      side: battleSideSchema,
      slot: z.int(),
      creature: savedCreatureSchema,
      count: z.int(),
      initialCount: z.int(),
      firstHealth: z.int(),
      shots: z.int(),
      col: z.int(),
      row: z.int(),
      turn: z.enum(["ready", "waiting", "waitingAfterMorale", "done"]),
      moraleUsed: z.boolean(),
      retaliated: z.boolean(),
      defendBonus: z.int(),
    }),
  ),
  activeStack: z.string().nullable(),
  lastActedSide: battleSideSchema,
  // В сохранении бой всегда идёт: оконченный бой в состоянии партии не хранится.
  result: z.null(),
}) satisfies z.ZodType<BattleState>;

/** Идущий бой партии (docs/mechanics/23-map-battle.md). */
export const mapBattleSchema = z.strictObject({
  heroId: z.string(),
  guardId: z.string(),
  state: battleStateSchema,
});

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
