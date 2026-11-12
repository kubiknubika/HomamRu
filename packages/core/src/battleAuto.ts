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

/**
 * Команда компьютера за охранника, если сейчас его ход; иначе `undefined`.
 * Тот, кто ведёт партию (экран, сценарий), применяет её как обычную команду.
 */
export function guardBattleCommand(state: GameState): BattleCommand | undefined {
  const battle = state.battle?.state;
  if (battle === undefined || activeStackOf(battle)?.side !== 1) {
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
 * `onlyGuard` — ходит только охранник: бой останавливается, когда ход переходит герою.
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
