/**
 * Применение команд и повтор партии.
 * Спецификация: docs/mechanics/00-state-and-commands.md.
 */
import { applyChooseSkill, heroChoosingSkill } from "./hero.ts";
import { applyBuyBook, learnSpells } from "./magic.ts";
import { applyMapBattleCommand } from "./mapBattle.ts";
import { applyMoveHero } from "./movement.ts";
import { applyEndTurn } from "./time.ts";
import { applyHireHero } from "./tavern.ts";
import { applyTownCommand } from "./town.ts";
import { reject } from "./types.ts";
import type { BattleCommand } from "./battle/types.ts";
import type {
  ChooseSkillCommand,
  Command,
  CommandRejected,
  CommandResult,
  GameEvent,
  GameState,
} from "./types.ts";

type MapCommand = Exclude<Command, BattleCommand | ChooseSkillCommand>;

const MAP_COMMANDS: ReadonlySet<string> = new Set([
  "moveHero",
  "endTurn",
  "build",
  "recruit",
  "transfer",
  "hireHero",
  "buyBook",
  "chooseSkill",
]);
const BATTLE_COMMANDS: ReadonlySet<string> = new Set([
  "battleMove",
  "battleAttack",
  "battleShoot",
  "battleWait",
  "battleDefend",
  "battleFlee",
  "battleCast",
]);

/**
 * Применяет команду: возвращает новое состояние и события либо отказ.
 * Переданное состояние не меняется.
 */
export function applyCommand(state: GameState, command: Command): CommandResult {
  const type: string = command.type;
  if (!MAP_COMMANDS.has(type) && !BATTLE_COMMANDS.has(type)) {
    return reject("UNKNOWN_COMMAND", `Неизвестная команда «${type}».`);
  }
  if (state.outcome !== null) {
    return reject("GAME_OVER", "Партия окончена.");
  }
  if (
    command.type !== "moveHero" &&
    command.type !== "endTurn" &&
    command.type !== "build" &&
    command.type !== "recruit" &&
    command.type !== "transfer" &&
    command.type !== "hireHero" &&
    command.type !== "buyBook" &&
    command.type !== "chooseSkill"
  ) {
    return learned(applyMapBattleCommand(state, command));
  }
  if (state.battle !== null) {
    return reject("BATTLE_IN_PROGRESS", "Идёт бой: сначала нужно его закончить.");
  }
  if (!state.players.some((player) => player.id === command.player)) {
    return reject("UNKNOWN_PLAYER", `Игрока с номером ${command.player} нет.`);
  }
  if (command.type === "chooseSkill") {
    // Навык выбирают и в чужой ход: уровень мог прийти за победу в обороне.
    return applyChooseSkill(state, command);
  }
  if (command.player !== state.currentPlayer) {
    return reject("NOT_YOUR_TURN", `Сейчас ход игрока ${state.currentPlayer + 1}.`);
  }
  if (heroChoosingSkill(state, command.player) !== undefined) {
    return reject("SKILL_CHOICE_PENDING", "Сначала выберите навык герою.");
  }
  return learned(applyMapCommand(state, command));
}

function applyMapCommand(state: GameState, command: MapCommand): CommandResult {
  switch (command.type) {
    case "moveHero":
      return applyMoveHero(state, command);
    case "endTurn":
      return applyEndTurn(state, command);
    case "hireHero":
      return applyHireHero(state, command);
    case "buyBook":
      return applyBuyBook(state, command);
    default:
      return applyTownCommand(state, command);
  }
}

/** После принятой команды герой в своём городе с гильдией выучивает её заклинания (61-magic.md). */
function learned(result: CommandResult): CommandResult {
  if (!result.ok || result.state.battle !== null) {
    return result;
  }
  const events = [...result.events];
  const state = learnSpells(result.state, events);
  return state === result.state ? result : { ok: true, state, events };
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
