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

export const NO_RESOURCES: Resources = { gold: 0, wood: 0, ore: 0 };

/** Что и сколько шахта даёт в день. Числа — из Heroes 3. */
export const MINE_INCOME: Readonly<
  Record<MineKind, { readonly resource: Resource; readonly amount: number }>
> = {
  sawmill: { resource: "wood", amount: 2 },
  "ore-pit": { resource: "ore", amount: 2 },
  "gold-mine": { resource: "gold", amount: 1000 },
};

/** Случайная кучка: от 5 до 10 единиц; золото — сотнями. Так в Heroes 3. */
const PILE_MIN = 5;
const PILE_MAX = 10;
const GOLD_PILE_UNIT = 100;

export function addResources(a: Resources, b: ResourceAmounts): Resources {
  return {
    gold: a.gold + (b.gold ?? 0),
    wood: a.wood + (b.wood ?? 0),
    ore: a.ore + (b.ore ?? 0),
  };
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
      const { owner, buildings = [], garrison = [] } = definition;
      // Существа в жилищах появятся, когда партия собрана целиком (game.ts).
      return {
        id,
        type: "town",
        x,
        y,
        owner,
        buildings: [...buildings],
        builtToday: false,
        available: [],
        garrison: mergeArmy(garrison),
      };
    }
    const { resource } = definition;
    if (definition.amount !== undefined) {
      return { id, type: "pile", x, y, resource, amount: definition.amount };
    }
    const roll = nextInt(rng, PILE_MIN, PILE_MAX);
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
