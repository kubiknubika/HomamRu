/**
 * Простой проходчик карты: проверяет, что карту можно пройти (docs/mechanics/25-first-map.md).
 * Идёт к ближайшей цели, которую можно взять без боя; когда таких нет — к слабейшему охраннику,
 * если армия достаточно сильна, иначе — в город за пополнением. В городе строит и нанимает.
 * Бои ведёт простой компьютер за обе стороны. Игрок-человек играет не хуже.
 */
import { applyCommand, findPath, playBattleOut, townOf } from "@homamru/core";
import type {
  Command,
  GameState,
  GuardState,
  HeroState,
  ObjectState,
  PathResult,
} from "@homamru/core";

import { armyValue, strongEnough, townCommand } from "./walkthroughTown.ts";

export interface Walkthrough {
  readonly state: GameState;
  /** Все принятые команды: по ним партию можно повторить. */
  readonly commands: readonly Command[];
  /** По строке на каждое событие прохождения: день и что случилось. */
  readonly journal: readonly string[];
  /** Все кучки собраны, все шахты заняты, все охранники побеждены. */
  readonly complete: boolean;
  /** Сколько боёв проиграно: героя после них нанимали заново. */
  readonly defeats: number;
}

/** Найденный путь. */
type FoundPath = Extract<PathResult, { found: true }>;

interface Goal {
  readonly object: ObjectState;
  readonly path: FoundPath;
}

function activeHeroOf(state: GameState): HeroState | undefined {
  return state.heroes.find((hero) => hero.owner === state.currentPlayer);
}

/** Цель прохождения: чужая шахта, кучка, охранник. Свой город — не цель. */
function wanted(state: GameState, object: ObjectState): boolean {
  if (object.type === "town") {
    return false;
  }
  return object.type !== "mine" || object.owner !== state.currentPlayer;
}

/** Путь к объекту, если он есть. */
function goalOf(state: GameState, heroId: string, object: ObjectState): Goal | undefined {
  const path = findPath(state, heroId, object);
  return path.found && path.steps.length > 0 ? { object, path } : undefined;
}

function cheapest(goals: readonly Goal[]): Goal | undefined {
  return goals.toSorted((a, b) => a.path.cost - b.path.cost)[0];
}

/** Слабейший охранник — самый дешёвый в золоте: числа существ разных видов не сравнить. */
function weakest(
  state: GameState,
  guards: readonly (Goal & { object: GuardState })[],
): Goal | undefined {
  return guards.toSorted((a, b) => armyValue(state, [a.object]) - armyValue(state, [b.object]))[0];
}

/**
 * Куда идти дальше: сначала то, что берётся без боя; потом слабейший охранник, если армия
 * достаточно сильна; иначе — в город за пополнением. `undefined` — стоять и ждать.
 */
function nextGoal(state: GameState, hero: HeroState): Goal | undefined {
  const free: Goal[] = [];
  const guards: (Goal & { object: GuardState })[] = [];
  for (const object of state.objects.filter((candidate) => wanted(state, candidate))) {
    const goal = goalOf(state, hero.id, object);
    if (goal !== undefined && object.type === "guard") {
      guards.push({ object, path: goal.path });
    } else if (goal !== undefined) {
      free.push(goal);
    }
  }
  const nearest = cheapest(free);
  if (nearest !== undefined) {
    return nearest;
  }
  const guard = weakest(state, guards);
  const town = townOf(state, hero.owner);
  if (guard === undefined || town === undefined) {
    return guard;
  }
  const ready = guard.object.type === "guard" && strongEnough(state, hero, guard.object);
  return ready ? guard : goalOf(state, hero.id, town);
}

/** Осталось ли что брать на карте. */
function unfinished(state: GameState): boolean {
  return state.objects.some((object) => wanted(state, object));
}

function armyText(state: GameState): string {
  const hero = activeHeroOf(state);
  return hero === undefined
    ? "героя нет"
    : hero.army.map((stack) => `${stack.creature} ${stack.count}`).join(", ");
}

/** Проходит карту, пока есть цели, герой жив и не вышел срок. */
export function walkThrough(initial: GameState, maxDays: number): Walkthrough {
  let state = initial;
  const commands: Command[] = [];
  const journal: string[] = [];

  function send(command: Command): boolean {
    const result = applyCommand(state, command);
    if (result.ok) {
      commands.push(command);
      ({ state } = result);
    }
    return result.ok;
  }

  let defeats = 0;
  while (state.outcome === null && state.day <= maxDays && unfinished(state)) {
    const order = townCommand(state);
    if (order !== undefined && send(order)) {
      if (order.type === "build") {
        journal.push(`день ${state.day}: построено ${order.building}`);
      } else if (order.type === "hireHero") {
        journal.push(`день ${state.day}: нанят герой; армия: ${armyText(state)}`);
      }
      continue;
    }
    const hero = activeHeroOf(state);
    const goal = hero === undefined ? undefined : nextGoal(state, hero);
    const steps = goal?.path.steps.slice(0, goal.path.stepsToday) ?? [];
    const moved =
      hero !== undefined &&
      steps.length > 0 &&
      send({ type: "moveHero", player: state.currentPlayer, heroId: hero.id, path: steps });
    if (!moved) {
      // Идти некуда или не на что: ждём следующего дня — доход, прирост, новый герой.
      if (!send({ type: "endTurn", player: state.currentPlayer })) {
        break;
      }
      continue;
    }
    if (state.battle !== null) {
      const guard = state.objects.find((object) => object.id === state.battle?.guardId);
      const before = guard?.type === "guard" ? `${guard.creature} ${guard.count}` : "?";
      const mine = armyText(state);
      const played = playBattleOut(state);
      commands.push(...played.commands);
      ({ state } = played);
      const won = activeHeroOf(state) !== undefined;
      defeats += won ? 0 : 1;
      journal.push(
        `день ${state.day}: бой с ${before} (армия: ${mine}) — ${won ? `победа; осталось: ${armyText(state)}` : "поражение"}`,
      );
    }
  }
  const complete = state.outcome === null && !unfinished(state);
  journal.push(`день ${state.day}: ${complete ? "карта пройдена" : "карта не пройдена"}`);
  return { state, commands, journal, complete, defeats };
}
