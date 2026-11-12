/**
 * Чтение игрового состояния, пришедшего извне: из сохранения и дампа.
 * Состояние читается терпимо: чего нет — берётся начальное значение, чего игра не знает — убирается.
 * Правила и таблица начальных значений: docs/mechanics/04-save.md, «Сохранения других версий».
 * Описание полей: docs/mechanics/00-state-and-commands.md.
 */
import {
  heroIdOf,
  levelOf,
  MAX_PLAYERS,
  MAX_STACKS,
  POWER_PER_CREATURE,
  STATE_VERSION,
  TERRAIN_LAND,
  TERRAIN_OBSTACLE,
} from "@homamru/core";
import type {
  ArmyStack,
  CreatureDefinition,
  GameState,
  HeroState,
  MapBattle,
  ObjectState,
  Position,
} from "@homamru/core";
import { z } from "zod";
import { creatureSchema } from "./battle.ts";
import type { SaveDefaults } from "./defaults.ts";
import {
  armyStackSchema,
  cellSchema,
  DEFAULTS,
  heroSchema,
  looseStateSchema,
  mapBattleSchema,
  NO_HERO,
  NO_RESOURCES,
  objectSchema,
} from "./stateSchemas.ts";
import type { LooseState } from "./stateSchemas.ts";

/** Из списка произвольных данных — только то, что читается по схеме. */
function readable<S extends z.ZodType>(items: readonly unknown[], schema: S): z.infer<S>[] {
  return items.flatMap((item) => {
    const parsed = schema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

/** Незнакомые символы местности заменяются обычной землёй. Строки разной длины — `null`. */
function readTerrain(rows: readonly string[]): string[] | null {
  const width = rows[0]?.length ?? 0;
  if (rows.some((row) => row.length !== width)) {
    return null;
  }
  return rows.map((row) =>
    [...row]
      .map((symbol) => (symbol === TERRAIN_OBSTACLE ? TERRAIN_OBSTACLE : TERRAIN_LAND))
      .join(""),
  );
}

/** Первая клетка земли, если читать карту по строкам. На ней стоит тот, кому больше негде. */
function firstLand(terrain: readonly string[]): Position | null {
  for (const [y, row] of terrain.entries()) {
    const x = row.indexOf(TERRAIN_LAND);
    if (x >= 0) {
      return { x, y };
    }
  }
  return null;
}

/** Клетка земли из записи; иначе запасная. */
function landCell(raw: unknown, terrain: readonly string[], fallback: Position): Position {
  const cell = cellSchema.safeParse(raw);
  return cell.success && terrain[cell.data.y]?.[cell.data.x] === TERRAIN_LAND
    ? cell.data
    : fallback;
}

/** Существа партии: читаемые из записи, а за ними существа игры, которых в записи нет. */
function readCreatures(items: readonly unknown[], defaults: SaveDefaults): CreatureDefinition[] {
  // Незнакомые поля существа убираются, как и везде в состоянии.
  const saved = readable(items, creatureSchema.strip());
  const known = new Set(saved.map((creature) => creature.id));
  return [...saved, ...defaults.creatures.filter((creature) => !known.has(creature.id))];
}

/** Армия героя: отряды знакомых существ, не больше семи; если таких нет — начальная армия. */
function readArmy(
  items: readonly unknown[],
  known: ReadonlySet<string>,
  defaults: SaveDefaults,
): readonly ArmyStack[] {
  const army = readable(items, armyStackSchema)
    .filter((stack) => known.has(stack.creature))
    .slice(0, MAX_STACKS);
  return army.length > 0 ? army : defaults.heroArmy;
}

/**
 * Объекты, которые игра понимает: известного вида, на карте, не больше одного в клетке;
 * охранник — из знакомых существ.
 */
function readObjects(
  items: readonly unknown[],
  terrain: readonly string[],
  known: ReadonlySet<string>,
): ObjectState[] {
  const taken = new Set<string>();
  const objects: ObjectState[] = [];
  for (const object of readable(items, objectSchema)) {
    const key = `${object.x},${object.y}`;
    const unknownGuard = object.type === "guard" && !known.has(object.creature);
    if (terrain[object.y]?.[object.x] === undefined || taken.has(key) || unknownGuard) {
      continue;
    }
    taken.add(key);
    if (object.type === "guard") {
      // Сила — число существ в тысячных; если она с числом не сходится, дробь роста сбрасывается.
      const fits = Math.floor(object.power / POWER_PER_CREATURE) === object.count;
      objects.push(fits ? object : { ...object, power: object.count * POWER_PER_CREATURE });
    } else {
      objects.push(object);
    }
  }
  return objects;
}

type LooseHero = z.infer<typeof heroSchema> | typeof NO_HERO;

interface HeroContext {
  readonly terrain: readonly string[];
  readonly starts: readonly Position[];
  readonly land: Position;
  readonly known: ReadonlySet<string>;
  readonly defaults: SaveDefaults;
}

function readHero(hero: LooseHero, index: number, context: HeroContext): HeroState {
  const owner = hero.owner ?? Math.min(index, MAX_PLAYERS - 1);
  // Клетки нет или она вне карты — герой встаёт на стартовую клетку своего игрока.
  const start = context.starts[owner] ?? context.land;
  const { x, y } = hero;
  const inside = x !== undefined && y !== undefined && context.terrain[y]?.[x] !== undefined;
  return {
    id: hero.id ?? heroIdOf(owner),
    owner,
    x: inside ? x : start.x,
    y: inside ? y : start.y,
    movement: hero.movement,
    attack: hero.attack,
    defense: hero.defense,
    army: readArmy(hero.army, context.known, context.defaults),
    experience: hero.experience,
    // Уровень всегда считается по опыту.
    level: levelOf(hero.experience),
  };
}

/**
 * Идущий бой: цел и сходится с партией — нападает герой с его армией, обороняется охранник
 * в его числе. Иначе боя нет: конец такого боя нельзя было бы перенести на карту.
 */
function readBattle(
  raw: unknown,
  heroes: readonly HeroState[],
  objects: readonly ObjectState[],
): MapBattle | null {
  const battle = mapBattleSchema.safeParse(raw);
  if (!battle.success) {
    return DEFAULTS.battle;
  }
  const { heroId, guardId, state } = battle.data;
  const hero = heroes.find((candidate) => candidate.id === heroId);
  const guard = objects.find((object) => object.id === guardId);
  if (hero === undefined || guard?.type !== "guard") {
    return DEFAULTS.battle;
  }
  const expected = [...hero.army.map((stack) => ({ side: 0, ...stack })), { side: 1, ...guard }];
  const fits =
    state.stacks.length === expected.length &&
    state.stacks.every((stack, index) => {
      const want = expected[index];
      return (
        stack.side === want?.side &&
        stack.creature.id === want.creature &&
        stack.initialCount === want.count
      );
    });
  return fits ? battle.data : DEFAULTS.battle;
}

/** Второй проход: значения, зависящие друг от друга. `null` — партию продолжить нельзя. */
function finishState(loose: LooseState, defaults: SaveDefaults): GameState | null {
  const terrain = readTerrain(loose.map.terrain);
  const land = terrain === null ? null : firstLand(terrain);
  if (terrain === null || land === null) {
    return null;
  }
  const starts = loose.map.starts
    .slice(0, MAX_PLAYERS)
    .map((start) => landCell(start, terrain, land));
  const creatures = readCreatures(loose.creatures, defaults);
  const known = new Set(creatures.map((creature) => creature.id));
  // Списка героев нет — по герою каждому игроку, о котором в записи хоть что-то есть.
  // После поражения героя нет, и это не пропуск.
  const count = Math.max(1, Math.min(MAX_PLAYERS, Math.max(loose.players.length, starts.length)));
  const saved = readable(loose.heroes, heroSchema);
  const listed =
    saved.length > 0 || loose.outcome !== null
      ? saved
      : Array.from({ length: count }, () => NO_HERO);
  const context = { terrain, starts, land, known, defaults };
  const heroes = listed.map((hero, index) => readHero(hero, index, context));
  const objects = readObjects(loose.objects, terrain, known);
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
  return {
    version: STATE_VERSION,
    rng: loose.rng,
    map: {
      id: loose.map.id,
      name: loose.map.name,
      width: terrain[0]?.length ?? 0,
      height: terrain.length,
      terrain,
      starts,
    },
    players: Array.from({ length: playerCount }, (_, id) => ({
      id,
      resources: loose.players[id]?.resources ?? NO_RESOURCES,
    })),
    heroes,
    objects,
    day: loose.day,
    currentPlayer: loose.currentPlayer < playerCount ? loose.currentPlayer : DEFAULTS.currentPlayer,
    creatures,
    battle: readBattle(loose.battle, heroes, objects),
    outcome: loose.outcome,
  };
}

/**
 * Читает состояние из произвольных данных. `null` — в данных нет того, без чего партию
 * не продолжить: местности, или на карте нет ни одной клетки земли.
 */
export function readState(raw: unknown, defaults: SaveDefaults): GameState | null {
  const loose = looseStateSchema.safeParse(raw);
  return loose.success ? finishState(loose.data, defaults) : null;
}
