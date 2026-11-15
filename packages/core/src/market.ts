// Рынок: обмен ресурсов в городе (docs/mechanics/72-market.md).
import { addResources } from "./objects.ts";
import { pay } from "./town.ts";
import { reject } from "./types.ts";
import type { CommandResult, GameEvent, GameState, Resource, TownState } from "./types.ts";

export interface TradeCommand {
  readonly type: "trade";
  readonly player: number;
  readonly townId: string;
  /** Ресурс, который игрок отдаёт. */
  readonly give: Resource;
  /** Ресурс, который игрок получает. */
  readonly want: Resource;
  /** Число сделок по курсу рынка. */
  readonly count: number;
}

/** Курс одной сделки: сколько отдать и сколько получить. */
export interface MarketRate {
  readonly give: number;
  readonly get: number;
}

/** Вес ресурса на рынке: золото — 1, дерево и руда — 250, редкие — 500. */
export const RESOURCE_WEIGHT: Readonly<Record<Resource, number>> = {
  gold: 1,
  wood: 250,
  ore: 250,
  mercury: 500,
  sulfur: 500,
  crystal: 500,
  gems: 500,
};

/** Выгодность — `(рынков + 1) / 20`, не больше половины; считается в двадцатых долях. */
const SHARES = 20;
const MAX_SHARES = 10;

function hasMarket(state: GameState, town: TownState): boolean {
  return state.buildings.some(
    (building) => building.market === true && town.buildings.includes(building.id),
  );
}

/** Сколько рынков у игрока во всех его городах. */
export function marketCount(state: GameState, player: number): number {
  return state.objects.filter(
    (object) => object.type === "town" && object.owner === player && hasMarket(state, object),
  ).length;
}

/**
 * Курс обмена при данном числе рынков. Целые числа: `цена = вес желаемого × 20 / доли`,
 * дорогой отдаваемый ресурс даёт несколько единиц за одну (вверх), иначе несколько единиц
 * отдаётся за одну (до ближайшего, половина — вверх).
 */
export function marketRate(give: Resource, want: Resource, markets: number): MarketRate {
  const shares = Math.min(markets + 1, MAX_SHARES);
  // Отдаю / цена = given / wanted; цена / Отдаю = wanted / given.
  const given = RESOURCE_WEIGHT[give] * shares;
  const wanted = RESOURCE_WEIGHT[want] * SHARES;
  if (given > wanted) {
    return { give: 1, get: Math.ceil(given / wanted) };
  }
  return { give: Math.floor((2 * wanted + given) / (2 * given)), get: 1 };
}

/** Обмен ресурсов на рынке своего города. */
export function applyTrade(state: GameState, command: TradeCommand): CommandResult {
  const { player, give, want, count } = command;
  const town = state.objects.find(
    (object): object is TownState =>
      object.type === "town" && object.id === command.townId && object.owner === player,
  );
  if (town === undefined) {
    return reject("NO_TOWN", `Города «${command.townId}» у игрока нет.`);
  }
  if (!hasMarket(state, town)) {
    return reject("NO_MARKET", "В городе нет рынка.");
  }
  if (give === want) {
    return reject("SAME_RESOURCE", "Менять ресурс на него же нельзя.");
  }
  if (!Number.isInteger(count) || count < 1) {
    return reject("BAD_COUNT", `Число ${count} не годится: нужно целое, не меньше 1.`);
  }
  const rate = marketRate(give, want, marketCount(state, player));
  const given = rate.give * count;
  const got = rate.get * count;
  const resources = state.players.find((candidate) => candidate.id === player)?.resources;
  if (resources === undefined || resources[give] < given) {
    return reject(
      "NOT_ENOUGH_RESOURCES",
      `Нужно отдать ${given}, а есть ${resources?.[give] ?? 0}.`,
    );
  }
  const paid = pay(state, player, { [give]: given });
  const players = paid.players.map((candidate) =>
    candidate.id === player
      ? { ...candidate, resources: addResources(candidate.resources, { [want]: got }) }
      : candidate,
  );
  const events: GameEvent[] = [
    { type: "resourcesTraded", player, townId: town.id, give, given, want, got },
  ];
  return { ok: true, state: { ...paid, players }, events };
}
