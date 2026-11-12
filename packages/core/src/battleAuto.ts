/**
 * Ходы простого компьютера в бою внутри партии.
 * Спецификации: docs/mechanics/15-battle-ai.md, 23-map-battle.md («Кто ходит», «Сценарии»).
 */
import { chooseBattleCommand } from "./battle/ai.ts";
import { activeStackOf } from "./battle/queries.ts";
import type { BattleCommand } from "./battle/types.ts";
import { applyCommand } from "./commands.ts";
import type { GameEvent } from "./events.ts";
import type { GameState } from "./types.ts";

/** Ходит ли за сторону боя компьютер: за охранника — всегда, иначе решает вид игрока. */
function sideIsComputer(state: GameState, side: 0 | 1): boolean {
  const { battle } = state;
  if (battle === null || (side === 1 && battle.guardId !== null)) {
    return true;
  }
  const heroId = side === 0 ? battle.heroId : battle.defenderHeroId;
  const hero = state.heroes.find((candidate) => candidate.id === heroId);
  const town = state.objects.find((object) => object.id === battle.townId);
  const owner = hero?.owner ?? (town?.type === "town" ? town.owner : undefined);
  return state.players.find((player) => player.id === owner)?.kind !== "human";
}

/**
 * Команда компьютера в бою, если сейчас ходит его отряд: охранника или компьютерного
 * игрока (40-two-players.md); иначе `undefined` — ходит человек.
 * Тот, кто ведёт партию (экран, сценарий), применяет её как обычную команду.
 */
export function guardBattleCommand(state: GameState): BattleCommand | undefined {
  const battle = state.battle?.state;
  const side = battle === undefined ? undefined : activeStackOf(battle)?.side;
  if (battle === undefined || side === undefined || !sideIsComputer(state, side)) {
    return undefined;
  }
  return chooseBattleCommand(battle);
}

export interface BattlePlayedOut {
  readonly state: GameState;
  /** Принятые команды по порядку. */
  readonly commands: readonly BattleCommand[];
  readonly events: readonly GameEvent[];
}

/**
 * Доигрывает идущий бой простым компьютером за обе стороны.
 * `onlyGuard` — ходит только компьютер: бой останавливается, когда ход переходит человеку.
 */
export function playBattleOut(initial: GameState, onlyGuard = false): BattlePlayedOut {
  let state = initial;
  const commands: BattleCommand[] = [];
  const events: GameEvent[] = [];
  while (state.battle !== null) {
    const command = onlyGuard ? guardBattleCommand(state) : chooseBattleCommand(state.battle.state);
    if (command === undefined) {
      break;
    }
    const result = applyCommand(state, command);
    if (!result.ok) {
      throw new Error(`Команда компьютера ${command.type} отклонена: ${result.code}`);
    }
    commands.push(command);
    events.push(...result.events);
    ({ state } = result);
  }
  return { state, commands, events };
}
