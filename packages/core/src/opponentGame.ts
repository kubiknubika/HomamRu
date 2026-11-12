/**
 * Партия, которую компьютер доигрывает за всех игроков: для консоли и проверок.
 * Спецификация: docs/mechanics/42-opponent.md, «Свойства, верные всегда».
 */
import { chooseBattleCommand } from "./battle/ai.ts";
import { applyCommand } from "./commands.ts";
import type { GameEvent } from "./events.ts";
import { chooseMapCommand } from "./opponent.ts";
import type { Command, GameState } from "./types.ts";

/** Больше команд за один ход компьютер не отдаёт; больше — значит, ход не кончается. */
export const TURN_COMMAND_LIMIT = 200;

export interface ComputerGame {
  readonly state: GameState;
  /** Все принятые команды: по ним партию можно повторить. */
  readonly commands: readonly Command[];
  /** Что пошло не так: отклонённая команда или ход, который не кончается. Пусто — всё в порядке. */
  readonly problems: readonly string[];
  /** Самое большое число команд карты за один ход. */
  readonly longestTurn: number;
}

/**
 * Ведёт партию до конца или до дня `maxDays`: за каждого игрока на карте и за обе стороны
 * в бою решает компьютер. `onEvents` получает события каждой принятой команды.
 */
export function playComputerGame(
  initial: GameState,
  maxDays: number,
  onEvents?: (state: GameState, events: readonly GameEvent[]) => void,
): ComputerGame {
  let state = initial;
  const commands: Command[] = [];
  const problems: string[] = [];
  let inTurn = 0;
  let longestTurn = 0;
  while (state.outcome === null && state.day <= maxDays && problems.length === 0) {
    const command =
      state.battle === null ? chooseMapCommand(state) : chooseBattleCommand(state.battle.state);
    if (command === undefined) {
      problems.push(`День ${state.day}: в бою нет команды.`);
      break;
    }
    const onMap = state.battle === null;
    const result = applyCommand(state, command);
    if (!result.ok) {
      problems.push(`День ${state.day}: команда ${command.type} отклонена: ${result.code}.`);
      break;
    }
    commands.push(command);
    ({ state } = result);
    onEvents?.(state, result.events);
    if (command.type === "endTurn") {
      inTurn = 0;
    } else if (onMap) {
      inTurn += 1;
      longestTurn = Math.max(longestTurn, inTurn);
    }
    if (inTurn > TURN_COMMAND_LIMIT) {
      problems.push(`День ${state.day}: ход игрока ${state.currentPlayer + 1} не кончается.`);
    }
  }
  return { state, commands, problems, longestTurn };
}
