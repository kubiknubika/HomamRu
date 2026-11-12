/**
 * Текст города и его событий. Спецификации: docs/mechanics/30-town.md, 31-recruitment.md.
 */
import type { GameEvent } from "./events.ts";
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

type TownEvent = Extract<
  GameEvent,
  { type: "buildingBuilt" | "creaturesGrew" | "creaturesRecruited" | "creaturesTransferred" }
>;

/** Печатает событие города одной строкой. */
export function formatTownEvent(event: TownEvent): string {
  switch (event.type) {
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
