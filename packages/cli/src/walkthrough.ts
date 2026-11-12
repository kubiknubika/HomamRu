/**
 * Простой проходчик карты: проверяет, что карту можно пройти (docs/mechanics/25-first-map.md).
 * Идёт к ближайшей цели, которую можно взять без боя; когда таких нет — к слабейшему охраннику.
 * Бои ведёт простой компьютер за обе стороны. Игрок-человек играет не хуже.
 */
import { applyCommand, findPath, playBattleOut } from "@homamru/core";
import type {
  Command,
  GameState,
  GuardState,
  HeroState,
  ObjectState,
  PathResult,
} from "@homamru/core";

export interface Walkthrough {
  readonly state: GameState;
  /** Все принятые команды: по ним партию можно повторить. */
  readonly commands: readonly Command[];
  /** По строке на каждое событие прохождения: день и что случилось. */
  readonly journal: readonly string[];
  /** Все кучки собраны, все шахты заняты, все охранники побеждены. */
  readonly complete: boolean;
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

function wanted(state: GameState, object: ObjectState): boolean {
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

function weakest(guards: readonly (Goal & { object: GuardState })[]): Goal | undefined {
  return guards.toSorted((a, b) => a.object.power - b.object.power)[0];
}

/** Куда идти дальше: сначала то, что берётся без боя, потом слабейший охранник. */
function nextGoal(state: GameState, heroId: string): Goal | undefined {
  const free: Goal[] = [];
  const guards: (Goal & { object: GuardState })[] = [];
  for (const object of state.objects.filter((candidate) => wanted(state, candidate))) {
    const goal = goalOf(state, heroId, object);
    if (goal !== undefined && object.type === "guard") {
      guards.push({ object, path: goal.path });
    } else if (goal !== undefined) {
      free.push(goal);
    }
  }
  return cheapest(free) ?? weakest(guards);
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

  while (state.outcome === null && state.day <= maxDays) {
    const hero = activeHeroOf(state);
    if (hero === undefined) {
      break;
    }
    const goal = nextGoal(state, hero.id);
    if (goal === undefined) {
      break;
    }
    const steps = goal.path.steps.slice(0, goal.path.stepsToday);
    const moved =
      steps.length > 0 &&
      send({ type: "moveHero", player: state.currentPlayer, heroId: hero.id, path: steps });
    if (!moved) {
      if (!send({ type: "endTurn", player: state.currentPlayer })) {
        break;
      }
      continue;
    }
    if (state.battle !== null) {
      const guard = state.objects.find((object) => object.id === state.battle?.guardId);
      const before = guard?.type === "guard" ? `${guard.creature} ${guard.count}` : "?";
      const played = playBattleOut(state);
      commands.push(...played.commands);
      ({ state } = played);
      const result = state.outcome === null ? "победа" : "поражение";
      journal.push(`день ${state.day}: бой с ${before} — ${result}; армия: ${armyText(state)}`);
    }
  }
  const complete =
    state.outcome === null && state.objects.every((object) => !wanted(state, object));
  journal.push(`день ${state.day}: ${complete ? "карта пройдена" : "карта не пройдена"}`);
  return { state, commands, journal, complete };
}
