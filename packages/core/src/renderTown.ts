/**
 * Текст города и его событий. Спецификации: docs/mechanics/30-town.md, 31-recruitment.md.
 */
import type { GameEvent } from "./events.ts";
import type { TavernOffer } from "./tavernTypes.ts";
import { RESOURCES } from "./types.ts";
import type { ArmyStack, GameState, ResourceAmounts, TownState } from "./types.ts";

const RESOURCE_NAMES = { gold: "золото", wood: "дерево", ore: "руда" } as const;

function armyText(state: GameState, army: readonly ArmyStack[]): string {
  if (army.length === 0) {
    return "пусто";
  }
  return army
    .map((stack) => {
      const name = state.creatures.find((creature) => creature.id === stack.creature)?.name;
      return `${(name ?? stack.creature).toLowerCase()} ${stack.count}`;
    })
    .join(", ");
}

function costText(cost: ResourceAmounts): string {
  return RESOURCES.filter((resource) => (cost[resource] ?? 0) > 0)
    .map((resource) => `${RESOURCE_NAMES[resource]} ${cost[resource]}`)
    .join(", ");
}

/** Город тремя строками: постройки, кто ждёт найма, гарнизон. */
export function formatTown(state: GameState, town: TownState): string[] {
  const names = town.buildings.map(
    (id) => state.buildings.find((building) => building.id === id)?.name.toLowerCase() ?? id,
  );
  const built = names.length === 0 ? "построек нет" : names.join(", ");
  return [
    `Город ${town.id} (${town.x}, ${town.y}), игрок ${town.owner + 1}: ${built}. Сегодня строили: ${town.builtToday ? "да" : "нет"}.`,
    `  Ждут найма: ${armyText(state, town.available)}.`,
    `  Гарнизон: ${armyText(state, town.garrison)}.`,
  ];
}

function offersText(state: GameState, offers: readonly TavernOffer[]): string {
  return offers
    .map((offer) => {
      const name = state.heroKinds.find((kind) => kind.id === offer.kind)?.name ?? offer.kind;
      return `${name} (${armyText(state, offer.army)})`;
    })
    .join("; ");
}

/** Таверна игрока одной строкой; у игрока без города таверны нет. */
export function formatTavern(
  state: GameState,
  player: number,
  offers: readonly TavernOffer[],
): string[] {
  return offers.length === 0 ? [] : [`Таверна игрока ${player + 1}: ${offersText(state, offers)}.`];
}

type TownEvent = Extract<
  GameEvent,
  {
    type:
      | "buildingBuilt"
      | "creaturesGrew"
      | "creaturesRecruited"
      | "creaturesTransferred"
      | "heroHired"
      | "tavernChanged";
  }
>;

const idArmy = (army: readonly ArmyStack[]) =>
  army.map((stack) => `${stack.creature} ${stack.count}`).join(", ");

/** Печатает событие города одной строкой. */
export function formatTownEvent(event: TownEvent): string {
  switch (event.type) {
    case "heroHired":
      return `В городе ${event.townId} нанят герой ${event.heroId} (${event.hero}): золото −${event.cost}; армия: ${idArmy(event.army)}`;
    case "tavernChanged": {
      const offers = event.offers.map((offer) => `${offer.kind} (${idArmy(offer.army)})`);
      return `В таверне игрока ${event.player + 1} теперь: ${offers.join("; ")}`;
    }
    case "buildingBuilt":
      return `В городе ${event.townId} построено ${event.building}: ${costText(event.spent)}`;
    case "creaturesGrew":
      return `В городе ${event.townId} прирост: ${event.creature} +${event.added}, ждут найма ${event.available}`;
    case "creaturesRecruited":
      return `В городе ${event.townId} нанято: ${event.creature} ${event.count}, золото −${event.cost}`;
    case "creaturesTransferred": {
      const way = event.from === "hero" ? "в гарнизон" : `герою ${event.heroId}`;
      return `В городе ${event.townId} передано ${way}: ${event.creature} ${event.count}`;
    }
  }
}
