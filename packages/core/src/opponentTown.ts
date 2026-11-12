/**
 * Компьютерный игрок: что он делает в своих городах.
 * Спецификация: docs/mechanics/42-opponent.md, «Город».
 */
import { applyCommand } from "./commands.ts";
import type { ArmyStack, Command, GameState, TownState } from "./types.ts";

function priceOf(state: GameState, creature: string): number {
  return state.creatures.find((candidate) => candidate.id === creature)?.price ?? 0;
}

/** Сила армии — сумма цен найма её существ. */
export function armyValue(state: GameState, army: readonly ArmyStack[]): number {
  return army.reduce((sum, stack) => sum + stack.count * priceOf(state, stack.creature), 0);
}

/** Города игрока по порядку списка объектов. */
export function townsOf(state: GameState, player: number): TownState[] {
  return state.objects.filter(
    (object): object is TownState => object.type === "town" && object.owner === player,
  );
}

/** Команда годится, только если ядро её примет: компьютер не отдаёт отклоняемых команд. */
export function accepted(state: GameState, command: Command): Command | undefined {
  return applyCommand(state, command).ok ? command : undefined;
}

/**
 * Следующее здание по списку: первое, которого нет, а всё нужное для него уже построено.
 * Здание, которому чего-то не хватает из построек, список не задерживает.
 */
function nextBuilding(state: GameState, town: TownState): string | undefined {
  return state.opponent.buildOrder.find((id) => {
    const building = state.buildings.find((candidate) => candidate.id === id);
    return (
      building !== undefined &&
      !town.buildings.includes(id) &&
      building.requires.every((needed) => town.buildings.includes(needed))
    );
  });
}

/** Наём: все, на кого хватает золота сверх отложенного на стройку, начиная с самых дорогих. */
function recruitCommand(state: GameState, town: TownState, reserve: number): Command | undefined {
  const gold = (state.players[town.owner]?.resources.gold ?? 0) - reserve;
  const dearFirst = town.available.toSorted(
    (a, b) => priceOf(state, b.creature) - priceOf(state, a.creature),
  );
  for (const stack of dearFirst) {
    const price = priceOf(state, stack.creature);
    const count = price > 0 ? Math.min(stack.count, Math.floor(gold / price)) : 0;
    const command: Command = {
      type: "recruit",
      player: town.owner,
      townId: town.id,
      creature: stack.creature,
      count,
    };
    if (count > 0 && accepted(state, command) !== undefined) {
      return command;
    }
  }
  return undefined;
}

/** Может ли игрок вообще нанять героя: есть город с таверной и в ней кто-то ждёт. */
function canHireSomewhere(state: GameState, player: number): boolean {
  const waiting =
    (state.players.find((candidate) => candidate.id === player)?.tavern.length ?? 0) > 0;
  return (
    waiting &&
    townsOf(state, player).some((town) =>
      state.buildings.some((b) => b.tavern === true && town.buildings.includes(b.id)),
    )
  );
}

/** Одна команда в этом городе; `undefined` — делать в нём нечего. */
function commandIn(state: GameState, town: TownState): Command | undefined {
  const player = town.owner;
  const base = { player, townId: town.id };
  const hero = state.heroes.find((candidate) => candidate.owner === player);
  if (hero === undefined) {
    const hire = accepted(state, { type: "hireHero", ...base, offer: 0 });
    if (hire !== undefined) {
      return hire;
    }
    if (canHireSomewhere(state, player)) {
      // Героя нет и на него не хватает: золото копится, пока не хватит.
      return undefined;
    }
  }
  const building = nextBuilding(state, town);
  if (building !== undefined) {
    const build = accepted(state, { type: "build", ...base, building });
    if (build !== undefined) {
      return build;
    }
  }
  // Золото на следующее здание по списку на наём не тратится.
  const reserve = state.buildings.find((candidate) => candidate.id === building)?.cost.gold ?? 0;
  const recruit = recruitCommand(state, town, reserve);
  if (recruit !== undefined) {
    return recruit;
  }
  if (hero?.x !== town.x || hero.y !== town.y) {
    return undefined;
  }
  // Герой в городе забирает у гарнизона всё, что помещается в армию.
  for (const stack of town.garrison) {
    const take = accepted(state, { type: "transfer", ...base, from: "garrison", ...stack });
    if (take !== undefined) {
      return take;
    }
  }
  return undefined;
}

/** Одна команда города для игрока, чей сейчас ход: города — по порядку. */
export function townCommand(state: GameState): Command | undefined {
  for (const town of townsOf(state, state.currentPlayer)) {
    const command = commandIn(state, town);
    if (command !== undefined) {
      return command;
    }
  }
  return undefined;
}
