/**
 * Проходчик: город и решение «драться или копить» (docs/mechanics/25-first-map.md).
 * Каждый день строит следующее здание по списку и нанимает всех, на кого хватает золота.
 */
import { buildObstacle, townOf } from "@homamru/core";
import type { ArmyStack, Command, GameState, HeroState, TownState } from "@homamru/core";

/** В каком порядке проходчик строит: сначала доход, потом жилища, потом прирост. */
const BUILD_ORDER = [
  "town-hall",
  "militia-yard",
  "slinger-range",
  "smithy",
  "barracks",
  "falcon-tower",
  "citadel",
  "castle",
] as const;

/** Во сколько раз армия героя должна быть дороже охранника, чтобы проходчик напал. */
const CAUTION = 1.5;

function priceOf(state: GameState, creature: string): number {
  return state.creatures.find((candidate) => candidate.id === creature)?.price ?? 0;
}

/** Цена армии в золоте: по ней проходчик сравнивает силы. */
export function armyValue(state: GameState, army: readonly ArmyStack[]): number {
  return army.reduce((sum, stack) => sum + stack.count * priceOf(state, stack.creature), 0);
}

function inTown(hero: HeroState | undefined, town: TownState): boolean {
  return hero !== undefined && hero.x === town.x && hero.y === town.y;
}

/** Следующее здание по списку, которого ещё нет. */
function nextBuilding(state: GameState, town: TownState): string | undefined {
  return BUILD_ORDER.find(
    (id) => !town.buildings.includes(id) && state.buildings.some((b) => b.id === id),
  );
}

/**
 * Одна команда города, которую стоит отдать сейчас; `undefined` — в городе делать нечего.
 * Порядок: наём героя, стройка, наём существ, передача гарнизона герою.
 */
export function townCommand(state: GameState): Command | undefined {
  const player = state.currentPlayer;
  const town = townOf(state, player);
  if (town === undefined) {
    return undefined;
  }
  const base = { player, townId: town.id };
  const gold = state.players[player]?.resources.gold ?? 0;
  const hero = state.heroes.find((candidate) => candidate.owner === player);
  if (hero === undefined) {
    return gold >= state.tavern.price ? { type: "hireHero", ...base, offer: 0 } : undefined;
  }
  const building = nextBuilding(state, town);
  if (building !== undefined && buildObstacle(state, town, building) === null) {
    return { type: "build", ...base, building };
  }
  // Золото на следующее здание не тратится на наём.
  const reserve =
    building === undefined
      ? 0
      : (state.buildings.find((candidate) => candidate.id === building)?.cost.gold ?? 0);
  for (const stack of town.available.toReversed()) {
    const count = Math.min(
      stack.count,
      Math.floor((gold - reserve) / priceOf(state, stack.creature)),
    );
    if (count > 0) {
      return { type: "recruit", ...base, creature: stack.creature, count };
    }
  }
  const waiting = town.garrison[0];
  if (waiting !== undefined && inTown(hero, town)) {
    return { type: "transfer", ...base, from: "garrison", ...waiting };
  }
  return undefined;
}

/** Нападать ли на охранника: армия героя дороже его в `CAUTION` раз. */
export function strongEnough(state: GameState, hero: HeroState, guard: ArmyStack): boolean {
  return armyValue(state, hero.army) >= CAUTION * armyValue(state, [guard]);
}
