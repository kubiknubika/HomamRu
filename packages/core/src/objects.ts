/**
 * Объекты карты и ресурсы игроков: кучки, шахты, доход.
 * Спецификация: docs/mechanics/20-map-objects.md.
 */
import { mergeArmy } from "./army.ts";
import { POWER_PER_CREATURE } from "./guards.ts";
import { nextInt } from "./rng.ts";
import { townIncome } from "./town.ts";
import type { RngState } from "./rng.ts";
import { RESOURCES } from "./types.ts";

/** Замок людей: у города без поля `faction` в файле карты он этот (30-town.md). */
const CASTLE_FACTION = "castle";
import type {
  GameEvent,
  GameState,
  MapObjectDefinition,
  MineKind,
  ObjectState,
  Resource,
  ResourceAmounts,
  Resources,
} from "./types.ts";

export const NO_RESOURCES: Resources = {
  gold: 0,
  wood: 0,
  ore: 0,
  mercury: 0,
  sulfur: 0,
  crystal: 0,
  gems: 0,
};

/** Что и сколько шахта даёт в день. Числа — из Heroes 3. */
export const MINE_INCOME: Readonly<
  Record<MineKind, { readonly resource: Resource; readonly amount: number }>
> = {
  sawmill: { resource: "wood", amount: 2 },
  "ore-pit": { resource: "ore", amount: 2 },
  "gold-mine": { resource: "gold", amount: 1000 },
  "alchemist-lab": { resource: "mercury", amount: 1 },
  "sulfur-dune": { resource: "sulfur", amount: 1 },
  "crystal-cavern": { resource: "crystal", amount: 1 },
  "gem-pond": { resource: "gems", amount: 1 },
};

/**
 * Случайная кучка: от 5 до 10 единиц; золото — сотнями; редкий ресурс — от 3 до 6.
 * Так в Heroes 3 (66-rare-resources.md).
 */
const PILE_MIN = 5;
const PILE_MAX = 10;
const RARE_PILE_MIN = 3;
const RARE_PILE_MAX = 6;
const GOLD_PILE_UNIT = 100;
const COMMON: readonly Resource[] = ["gold", "wood", "ore"];

export function addResources(a: Resources, b: ResourceAmounts): Resources {
  const sum = { ...a };
  for (const resource of RESOURCES) {
    sum[resource] += b[resource] ?? 0;
  }
  return sum;
}

/** Объект в клетке, если он там есть. */
export function objectAt(state: GameState, x: number, y: number): ObjectState | undefined {
  return state.objects.find((object) => object.x === x && object.y === y);
}

/**
 * Создаёт объекты партии из описания карты. Идентификаторы — по порядку в файле: `o1`, `o2`, …
 * Кучкам без количества оно выбирается случайно, по порядку объектов.
 */
export function createObjects(
  definitions: readonly MapObjectDefinition[],
  initialRng: RngState,
): { objects: ObjectState[]; rng: RngState } {
  let rng = initialRng;
  const objects = definitions.map((definition, index): ObjectState => {
    const id = `o${index + 1}`;
    const { x, y } = definition;
    if (definition.type === "mine") {
      return { id, type: "mine", x, y, kind: definition.kind, owner: null };
    }
    if (definition.type === "guard") {
      const { creature, count } = definition;
      return { id, type: "guard", x, y, creature, count, power: count * POWER_PER_CREATURE };
    }
    if (definition.type === "town") {
      const { owner, buildings = [], garrison = [], faction = CASTLE_FACTION } = definition;
      // Существа в жилищах появятся, когда партия собрана целиком (game.ts).
      return {
        id,
        type: "town",
        x,
        y,
        owner,
        // Замок города: от него зависит, какие жилища в нём строят (30-town.md).
        faction,
        buildings: [...buildings],
        builtToday: false,
        available: [],
        garrison: mergeArmy(garrison),
        // Набор гильдии выбирается после создания объектов (61-magic.md).
        spells: [],
      };
    }
    const { resource } = definition;
    if (definition.amount !== undefined) {
      return { id, type: "pile", x, y, resource, amount: definition.amount };
    }
    const roll = COMMON.includes(resource)
      ? nextInt(rng, PILE_MIN, PILE_MAX)
      : nextInt(rng, RARE_PILE_MIN, RARE_PILE_MAX);
    ({ rng } = roll);
    const amount = resource === "gold" ? roll.value * GOLD_PILE_UNIT : roll.value;
    return { id, type: "pile", x, y, resource, amount };
  });
  return { objects, rng };
}

/** Дневной доход игрока от его шахт и города. */
export function incomeOf(state: GameState, player: number): Resources {
  let income = NO_RESOURCES;
  for (const object of state.objects) {
    if (object.type === "town" && object.owner === player) {
      income = addResources(income, { gold: townIncome(state, object) });
    }
    if (object.type === "mine" && object.owner === player) {
      const { resource, amount } = MINE_INCOME[object.kind];
      income = addResources(income, { [resource]: amount });
    }
  }
  return income;
}

/**
 * Начало хода игрока: приходит доход от шахт. В первый день партии дохода нет.
 * Возвращает новое состояние; событие дописывается в список, если доход не нулевой.
 */
export function giveIncome(state: GameState, player: number, events: GameEvent[]): GameState {
  if (state.day < 2) {
    return state;
  }
  const income = incomeOf(state, player);
  if (RESOURCES.every((resource) => income[resource] === 0)) {
    return state;
  }
  events.push({ type: "incomeReceived", player, income });
  return {
    ...state,
    players: state.players.map((candidate) =>
      candidate.id === player
        ? { ...candidate, resources: addResources(candidate.resources, income) }
        : candidate,
    ),
  };
}
