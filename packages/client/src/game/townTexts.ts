/**
 * Слова и числа экрана города. Спецификация: docs/mechanics/33-town-screen.md.
 * Правил игры здесь нет: что можно, а что нельзя, решает ядро.
 */
import { buildObstacle, missingResources, RESOURCES, weeklyGrowth } from "@homamru/core";
import { RESOURCE_NAMES } from "./captions.ts";
import type {
  ArmyStack,
  BuildingDefinition,
  CreatureDefinition,
  GameState,
  ResourceAmounts,
  TownState,
} from "@homamru/core";

/** «золото 500, дерево 5»; ничего — «бесплатно». */
export function amountsText(amounts: ResourceAmounts): string {
  const parts = RESOURCES.filter((resource) => (amounts[resource] ?? 0) > 0).map(
    (resource) => `${RESOURCE_NAMES[resource]} ${amounts[resource]}`,
  );
  return parts.length === 0 ? "бесплатно" : parts.join(", ");
}

function creatureOf(state: GameState, id: string | undefined): CreatureDefinition | undefined {
  return state.creatures.find((creature) => creature.id === id);
}

function buildingName(state: GameState, id: string): string {
  return state.buildings.find((building) => building.id === id)?.name.toLowerCase() ?? id;
}

/** Что даёт здание — одной строкой. */
export function buildingGives(state: GameState, building: BuildingDefinition): string {
  if (building.tavern === true) {
    return "наём героя";
  }
  if (building.income !== undefined) {
    return `доход города ${building.income} золота в день`;
  }
  if (building.growthPercent !== undefined) {
    return `прирост во всех жилищах +${building.growthPercent}%`;
  }
  const dweller = creatureOf(state, building.dwelling);
  if (dweller !== undefined) {
    return `наём: ${dweller.name.toLowerCase()}, ${dweller.growth} в неделю`;
  }
  const needed = state.buildings
    .filter((other) => other.requires.includes(building.id))
    .map((other) => other.name.toLowerCase());
  return needed.length === 0 ? "" : `нужно для: ${needed.join(", ")}`;
}

export type BuildingStatus =
  | { readonly kind: "built" }
  | { readonly kind: "available" }
  | { readonly kind: "blocked"; readonly reason: string };

/** Состояние здания в списке: построено, можно строить или причина словами. */
export function buildingStatus(
  state: GameState,
  town: TownState,
  building: BuildingDefinition,
): BuildingStatus {
  if (town.buildings.includes(building.id)) {
    return { kind: "built" };
  }
  const obstacle = buildObstacle(state, town, building.id);
  if (obstacle === null || obstacle.ok) {
    return { kind: "available" };
  }
  if (obstacle.code === "BUILT_TODAY") {
    return { kind: "blocked", reason: "сегодня уже строили" };
  }
  if (obstacle.code === "REQUIREMENT_MISSING") {
    const absent = building.requires.filter((id) => !town.buildings.includes(id));
    const names = absent.map((id) => buildingName(state, id));
    return { kind: "blocked", reason: `нужно: ${names.join(", ")}` };
  }
  const resources = state.players[town.owner]?.resources;
  const missing = resources === undefined ? {} : missingResources(resources, building.cost);
  return { kind: "blocked", reason: `не хватает: ${amountsText(missing)}` };
}

/** Строка раздела «Наём»: жилище, его существо и числа. */
export interface RecruitRow {
  readonly creature: CreatureDefinition;
  /** Сколько ждёт найма. */
  readonly available: number;
  /** Прирост в неделю в этом городе, с цитаделью и замком. */
  readonly growth: number;
  /** Сколько можно нанять сейчас: сколько ждёт и на сколько хватает золота. */
  readonly affordable: number;
}

export function recruitRows(state: GameState, town: TownState): RecruitRow[] {
  const gold = state.players[town.owner]?.resources.gold ?? 0;
  const rows: RecruitRow[] = [];
  for (const id of town.buildings) {
    const building = state.buildings.find((candidate) => candidate.id === id);
    const creature = creatureOf(state, building?.dwelling);
    if (creature !== undefined) {
      const available = town.available.find((stack) => stack.creature === creature.id)?.count ?? 0;
      rows.push({
        creature,
        available,
        growth: weeklyGrowth(state, town, creature.growth),
        affordable: Math.min(available, Math.floor(gold / creature.price)),
      });
    }
  }
  return rows;
}

/** Армия одной строкой: «ополченец 12, пращник 5». */
export function armyText(state: GameState, army: readonly ArmyStack[]): string {
  return army
    .map((stack) => {
      const name = creatureOf(state, stack.creature)?.name ?? stack.creature;
      return `${name.toLowerCase()} ${stack.count}`;
    })
    .join(", ");
}
