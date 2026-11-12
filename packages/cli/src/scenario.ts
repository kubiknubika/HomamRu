/**
 * Проигрывание сценария. Спецификация: docs/mechanics/05-diagnostics.md.
 * Здесь нет работы с файлами: сценарий и карта приходят готовыми.
 */
import {
  activeStackOf,
  applyCommand,
  createGame,
  formatEvent,
  playBattleOut,
  renderState,
} from "@homamru/core";
import type { Command, CreatureDefinition, GameState, MapDefinition } from "@homamru/core";
import type { BattleScenarioStep, Scenario, ScenarioStep } from "@homamru/data";
import { battleStepCommand, describeBattleCommand } from "./battleScenario.ts";
import { checkExpectations } from "./scenarioExpect.ts";

export interface ScenarioRun {
  /** Сценарий прошёл: все ожидания совпали. */
  readonly ok: boolean;
  /** Текстовый вывод хода сценария. */
  readonly lines: readonly string[];
  /** Что не совпало с ожиданиями. */
  readonly failures: readonly string[];
  /** Состояние в конце; его нет, если партию не удалось создать. */
  readonly state?: GameState;
}

/** Команду карты отдаёт игрок, чей сейчас ход; команду боя — сторона, чей отряд ходит. */
function toCommand(step: Exclude<ScenarioStep, { fight: object }>, state: GameState): Command {
  if ("move" in step && "hero" in step.move) {
    const { hero, path } = step.move;
    return { type: "moveHero", player: state.currentPlayer, heroId: hero, path };
  }
  if ("endTurn" in step) {
    return { type: "endTurn", player: state.currentPlayer };
  }
  const battle = state.battle?.state;
  const side = battle === undefined ? 0 : (activeStackOf(battle)?.side ?? 0);
  return battleStepCommand(step as BattleScenarioStep, side);
}

function describe(command: Command): string {
  if (command.type === "moveHero") {
    return `переместить героя ${command.heroId}: ${command.path.join(", ")}`;
  }
  return command.type === "endTurn" ? "закончить ход" : `в бою — ${describeBattleCommand(command)}`;
}

/** Шаг «бой до конца»: бой доигрывает простой компьютер за обе стороны. */
function fightToEnd(state: GameState, lines: string[]): GameState {
  if (state.battle === null) {
    lines.push("  Боя нет: доигрывать нечего.");
    return state;
  }
  const played = playBattleOut(state);
  lines.push(
    `  Команд боя: ${played.commands.length}.`,
    ...played.events.map((event) => `  ${formatEvent(event)}`),
    "",
    renderState(played.state),
  );
  return played.state;
}

export function runScenario(
  scenario: Scenario,
  map: MapDefinition,
  creatures: readonly CreatureDefinition[],
): ScenarioRun {
  const created = createGame(map, scenario.seed, creatures);
  if (!created.ok) {
    const failures = created.errors.map((error) => `Карта: ${error.field}: ${error.message}`);
    return { ok: false, lines: [], failures };
  }
  let state = created.state;
  const lines = [`Сценарий: ${scenario.name}`, "", renderState(state)];
  const failures: string[] = [];
  for (const [index, step] of scenario.steps.entries()) {
    if ("fight" in step) {
      lines.push("", `Команда ${index + 1}: бой до конца`);
      if (state.battle === null) {
        failures.push(`Команда ${index + 1}: «бой до конца», но боя нет.`);
      }
      state = fightToEnd(state, lines);
      continue;
    }
    const command = toCommand(step, state);
    const result = applyCommand(state, command);
    lines.push("", `Команда ${index + 1}: ${describe(command)}`);
    if (result.ok) {
      state = result.state;
      lines.push(
        ...result.events.map((event) => `  ${formatEvent(event)}`),
        "",
        renderState(state),
      );
      if (step.expectError !== undefined) {
        failures.push(`Команда ${index + 1}: ожидался отказ ${step.expectError}, но она принята.`);
      }
      continue;
    }
    lines.push(`  Отказ ${result.code}: ${result.message}`);
    if (step.expectError !== result.code) {
      const wanted = step.expectError ?? "команда будет принята";
      failures.push(`Команда ${index + 1}: получен отказ ${result.code}, ожидалось: ${wanted}.`);
    }
  }
  failures.push(...checkExpectations(scenario, state));
  return { ok: failures.length === 0, lines, failures, state };
}
