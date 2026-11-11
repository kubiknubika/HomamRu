/**
 * Применение команд и повтор партии.
 * Спецификация: docs/mechanics/00-state-and-commands.md.
 */
import { applyMoveHero } from "./movement.ts";
import { applyEndTurn } from "./time.ts";
import { reject } from "./types.ts";
import type { Command, CommandRejected, CommandResult, GameEvent, GameState } from "./types.ts";

/**
 * Применяет команду: возвращает новое состояние и события либо отказ.
 * Переданное состояние не меняется.
 */
export function applyCommand(state: GameState, command: Command): CommandResult {
  const type: string = command.type;
  if (type !== "moveHero" && type !== "endTurn") {
    return reject("UNKNOWN_COMMAND", `Неизвестная команда «${type}».`);
  }
  if (!state.players.some((player) => player.id === command.player)) {
    return reject("UNKNOWN_PLAYER", `Игрока с номером ${command.player} нет.`);
  }
  if (command.player !== state.currentPlayer) {
    return reject("NOT_YOUR_TURN", `Сейчас ход игрока ${state.currentPlayer + 1}.`);
  }
  switch (command.type) {
    case "moveHero":
      return applyMoveHero(state, command);
    case "endTurn":
      return applyEndTurn(state, command);
  }
}

export type ReplayResult =
  | { readonly ok: true; readonly state: GameState; readonly events: readonly GameEvent[] }
  | { readonly ok: false; readonly commandIndex: number; readonly rejection: CommandRejected };

/**
 * Повторяет партию: применяет команды по очереди.
 * В партии записаны только принятые команды, поэтому отказ — признак расхождения.
 */
export function replay(initial: GameState, commands: readonly Command[]): ReplayResult {
  let state = initial;
  const events: GameEvent[] = [];
  for (const [commandIndex, command] of commands.entries()) {
    const result = applyCommand(state, command);
    if (!result.ok) {
      return { ok: false, commandIndex, rejection: result };
    }
    state = result.state;
    events.push(...result.events);
  }
  return { ok: true, state, events };
}
