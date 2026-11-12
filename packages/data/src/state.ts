/**
 * Чтение игрового состояния и команд, пришедших извне: из сохранения и дампа.
 * Состояние читается терпимо: чего нет — берётся начальное значение, чего игра не знает — убирается.
 * Правила и таблица начальных значений: docs/mechanics/04-save.md, «Сохранения других версий».
 * Описание полей: docs/mechanics/00-state-and-commands.md.
 */
import {
  DAILY_MOVEMENT,
  DIRECTIONS,
  heroIdOf,
  MAX_PLAYERS,
  MINE_KINDS,
  RESOURCES,
  STATE_VERSION,
  TERRAIN_LAND,
  TERRAIN_OBSTACLE,
} from "@homamru/core";
import type { Command, GameState, ObjectState } from "@homamru/core";
import { z } from "zod";

/**
 * Начальные значения параметров состояния — те, что вписываются, когда в записи их нет.
 * Новый параметр состояния обязан получить значение здесь и строку в таблице 04-save.md.
 */
const DEFAULTS = {
  rng: 0,
  mapId: "unknown",
  mapName: "Без названия",
  resource: 0,
  movement: DAILY_MOVEMENT,
  mineOwner: null,
  day: 1,
  currentPlayer: 0,
} as const;

const NO_RESOURCES = {
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
});

// Обычный `z.object` молча убирает незнакомые поля — это и есть правило «чего игра не знает».
const objectSchema = z.discriminatedUnion("type", [
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
]);

/** Первый проход: поля по одному. Что зависит от соседних полей, доделывает `finishState`. */
const looseStateSchema = z.object({
  rng: z
    .object({ s: z.int().min(0).max(UINT32_MAX).catch(DEFAULTS.rng) })
    .catch({ s: DEFAULTS.rng }),
  map: z.object({
    id: z.string().catch(DEFAULTS.mapId),
    name: z.string().catch(DEFAULTS.mapName),
    // Начального значения нет: без местности партию не продолжить.
    terrain: z.array(z.string().min(1)).min(1),
  }),
  players: z.array(playerSchema.catch({ resources: NO_RESOURCES })).catch([]),
  heroes: z
    .array(
      z.object({
        id: z.string().optional().catch(undefined),
        owner: playerNumberSchema.optional().catch(undefined),
        // Начального значения нет: клетку героя придумать нельзя.
        x: z.int(),
        y: z.int(),
        movement: z.int().min(0).catch(DEFAULTS.movement),
      }),
    )
    .min(1),
  objects: z.array(z.unknown()).catch([]),
  day: z.int().min(1).catch(DEFAULTS.day),
  currentPlayer: z.int().min(0).catch(DEFAULTS.currentPlayer),
});

type LooseState = z.infer<typeof looseStateSchema>;

/** Незнакомые символы местности заменяются преградой. Строки разной длины — `null`. */
function readTerrain(rows: readonly string[]): string[] | null {
  const width = rows[0]?.length ?? 0;
  if (rows.some((row) => row.length !== width)) {
    return null;
  }
  return rows.map((row) =>
    [...row].map((symbol) => (symbol === TERRAIN_LAND ? TERRAIN_LAND : TERRAIN_OBSTACLE)).join(""),
  );
}

/** Объекты, которые игра понимает: известного вида, на карте, не больше одного в клетке. */
function readObjects(items: readonly unknown[], width: number, height: number): ObjectState[] {
  const taken = new Set<string>();
  const objects: ObjectState[] = [];
  for (const item of items) {
    const parsed = objectSchema.safeParse(item);
    if (!parsed.success) {
      continue;
    }
    const { x, y } = parsed.data;
    const key = `${x},${y}`;
    if (x < 0 || y < 0 || x >= width || y >= height || taken.has(key)) {
      continue;
    }
    taken.add(key);
    objects.push(parsed.data);
  }
  return objects;
}

/** Второй проход: значения, зависящие друг от друга. `null` — партию продолжить нельзя. */
function finishState(loose: LooseState): GameState | null {
  const terrain = readTerrain(loose.map.terrain);
  if (terrain === null) {
    return null;
  }
  const width = terrain[0]?.length ?? 0;
  const height = terrain.length;
  if (
    loose.heroes.some((hero) => hero.x < 0 || hero.y < 0 || hero.x >= width || hero.y >= height)
  ) {
    return null;
  }
  const heroes = loose.heroes.map((hero, index) => {
    const owner = hero.owner ?? Math.min(index, MAX_PLAYERS - 1);
    return { id: hero.id ?? heroIdOf(owner), owner, x: hero.x, y: hero.y, movement: hero.movement };
  });
  const objects = readObjects(loose.objects, width, height);
  // Игроков столько, сколько нужно героям и шахтам, но не меньше одного и не больше предела.
  const owners = [
    ...heroes.map((hero) => hero.owner),
    ...objects.map((object) => (object.type === "mine" ? (object.owner ?? 0) : 0)),
  ];
  const playerCount = Math.max(
    1,
    Math.min(loose.players.length, MAX_PLAYERS),
    ...owners.map((owner) => owner + 1),
  );
  const players = Array.from({ length: playerCount }, (_, id) => ({
    id,
    resources: loose.players[id]?.resources ?? NO_RESOURCES,
  }));
  return {
    version: STATE_VERSION,
    rng: loose.rng,
    map: { id: loose.map.id, name: loose.map.name, width, height, terrain },
    players,
    heroes,
    objects,
    day: loose.day,
    currentPlayer: loose.currentPlayer < playerCount ? loose.currentPlayer : DEFAULTS.currentPlayer,
  };
}

/**
 * Читает состояние из произвольных данных. `null` — в данных нет того, без чего партию
 * не продолжить (местности или клетки героя).
 */
export function readState(raw: unknown): GameState | null {
  const loose = looseStateSchema.safeParse(raw);
  return loose.success ? finishState(loose.data) : null;
}

/** То же чтение в виде схемы — для разбора дампа. */
export const gameStateSchema = z.unknown().transform((raw, ctx): GameState => {
  const state = readState(raw);
  if (state === null) {
    ctx.addIssue({
      code: "custom",
      message: "Состояние не читается: нет местности или клетки героя.",
    });
    return z.NEVER;
  }
  return state;
});

export const commandSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("moveHero"),
    player: z.int(),
    heroId: z.string(),
    path: z.array(z.enum(DIRECTIONS)),
  }),
  z.strictObject({ type: z.literal("endTurn"), player: z.int() }),
]) satisfies z.ZodType<Command>;
