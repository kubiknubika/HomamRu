/** Проигрывает сценарий боя и печатает ход боя. */
import {
  activeStackOf,
  applyBattleCommand,
  createBattle,
  findStack,
  formatBattleEvent,
  renderBattle,
} from "@homamru/core";
import type {
  BattleCommand,
  BattleDefinition,
  BattleState,
  CreatureDefinition,
} from "@homamru/core";
import type { BattleScenario, BattleScenarioStep } from "@homamru/data";
import type { ScenarioRun } from "./scenario.ts";

/** Команду отдаёт сторона, чей отряд сейчас ходит. */
function toCommand(step: BattleScenarioStep, side: 0 | 1): BattleCommand {
  if ("move" in step) {
    return { type: "battleMove", side, to: step.move };
  }
  if ("attack" in step) {
    return { type: "battleAttack", side, target: step.attack.target, from: step.attack.from };
  }
  if ("shoot" in step) {
    return { type: "battleShoot", side, target: step.shoot };
  }
  if ("wait" in step) {
    return { type: "battleWait", side };
  }
  return "defend" in step ? { type: "battleDefend", side } : { type: "battleFlee", side };
}

function describe(command: BattleCommand): string {
  switch (command.type) {
    case "battleMove":
      return `переместиться на (${command.to.col}, ${command.to.row})`;
    case "battleAttack":
      return `ударить ${command.target} с клетки (${command.from.col}, ${command.from.row})`;
    case "battleShoot":
      return `выстрелить в ${command.target}`;
    case "battleWait":
      return "ждать";
    case "battleDefend":
      return "защищаться";
    case "battleFlee":
      return "бежать";
  }
}

const WINNER_NAMES = ["attacker", "defender"] as const;

function checkStacks(scenario: BattleScenario, state: BattleState): string[] {
  const failures: string[] = [];
  for (const [id, want] of Object.entries(scenario.expect?.stacks ?? {})) {
    const stack = findStack(state, id);
    if (stack === undefined) {
      failures.push(`Ожидался отряд ${id}, но его нет.`);
      continue;
    }
    if (want.count !== undefined && want.count !== stack.count) {
      failures.push(`Отряд ${id}: ожидалось существ ${want.count}, получено ${stack.count}.`);
    }
    if (want.cell !== undefined && (want.cell.col !== stack.col || want.cell.row !== stack.row)) {
      failures.push(
        `Отряд ${id}: ожидалась клетка (${want.cell.col}, ${want.cell.row}), получена (${stack.col}, ${stack.row}).`,
      );
    }
    if (want.shots !== undefined && want.shots !== stack.shots) {
      failures.push(`Отряд ${id}: ожидалось выстрелов ${want.shots}, получено ${stack.shots}.`);
    }
  }
  return failures;
}

function checkExpectations(scenario: BattleScenario, state: BattleState): string[] {
  const failures: string[] = [];
  const expected = scenario.expect;
  if (expected?.winner !== undefined) {
    const winner = state.result === null ? "нет" : WINNER_NAMES[state.result.winner];
    if (winner !== expected.winner) {
      failures.push(`Ожидался победитель ${expected.winner}, получено: ${winner}.`);
    }
  }
  if (expected?.active !== undefined && expected.active !== state.activeStack) {
    failures.push(
      `Ожидался ход отряда ${expected.active}, сейчас ход: ${state.activeStack ?? "нет"}.`,
    );
  }
  return [...failures, ...checkStacks(scenario, state)];
}

export function runBattleScenario(
  scenario: BattleScenario,
  battle: BattleDefinition,
  creatures: readonly CreatureDefinition[],
): ScenarioRun {
  const created = createBattle(battle, creatures, scenario.seed);
  if (!created.ok) {
    const failures = created.errors.map((error) => `Бой: ${error.field}: ${error.message}`);
    return { ok: false, lines: [], failures };
  }
  let { state } = created;
  const lines = [
    `Сценарий боя: ${scenario.name}`,
    ...created.events.map((event) => `  ${formatBattleEvent(event)}`),
    "",
    renderBattle(state),
  ];
  const failures: string[] = [];
  for (const [index, step] of scenario.steps.entries()) {
    const command = toCommand(step, activeStackOf(state)?.side ?? 0);
    const result = applyBattleCommand(state, command);
    lines.push("", `Команда ${index + 1}: ${describe(command)}`);
    if (result.ok) {
      state = result.state;
      lines.push(
        ...result.events.map((event) => `  ${formatBattleEvent(event)}`),
        "",
        renderBattle(state),
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
  return { ok: failures.length === 0, lines, failures };
}
