/**
 * Проигрывание сценария. Спецификация: docs/mechanics/05-diagnostics.md.
 * Здесь нет работы с файлами: сценарий и карта приходят готовыми.
 */
import { applyCommand, createGame, formatEvent, renderState } from "@homamru/core";
import type { Command, GameState, MapDefinition } from "@homamru/core";
import type { Scenario, ScenarioStep } from "@homamru/data";

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

/** Команду отдаёт игрок, чей сейчас ход. */
function toCommand(step: ScenarioStep, player: number): Command {
  if ("move" in step) {
    return { type: "moveHero", player, heroId: step.move.hero, path: step.move.path };
  }
  return { type: "endTurn", player };
}

function describe(command: Command): string {
  return command.type === "moveHero"
    ? `переместить героя ${command.heroId}: ${command.path.join(", ")}`
    : "закончить ход";
}

function checkExpectations(scenario: Scenario, state: GameState): string[] {
  const failures: string[] = [];
  const expected = scenario.expect;
  if (expected?.day !== undefined && expected.day !== state.day) {
    failures.push(`Ожидался день ${expected.day}, получен день ${state.day}.`);
  }
  for (const [heroId, want] of Object.entries(expected?.heroes ?? {})) {
    const hero = state.heroes.find((candidate) => candidate.id === heroId);
    if (hero === undefined) {
      failures.push(`Ожидался герой ${heroId}, но его нет.`);
      continue;
    }
    if (hero.x !== want.x || hero.y !== want.y) {
      failures.push(
        `Герой ${heroId}: ожидалась клетка (${want.x}, ${want.y}), получена (${hero.x}, ${hero.y}).`,
      );
    }
    if (want.movement !== undefined && want.movement !== hero.movement) {
      failures.push(
        `Герой ${heroId}: ожидался запас хода ${want.movement}, получен ${hero.movement}.`,
      );
    }
  }
  return failures;
}

export function runScenario(scenario: Scenario, map: MapDefinition): ScenarioRun {
  const created = createGame(map, scenario.seed);
  if (!created.ok) {
    const failures = created.errors.map((error) => `Карта: ${error.field}: ${error.message}`);
    return { ok: false, lines: [], failures };
  }
  let state = created.state;
  const lines = [`Сценарий: ${scenario.name}`, "", renderState(state)];
  const failures: string[] = [];
  for (const [index, step] of scenario.steps.entries()) {
    const command = toCommand(step, state.currentPlayer);
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
