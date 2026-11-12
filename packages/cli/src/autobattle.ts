/** Автобои из консоли: сводка по многим боям и подробный вывод одного боя. */
import {
  applyBattleCommand,
  createBattle,
  formatBattleEvent,
  randomBattle,
  renderBattle,
  runAutoBattle,
} from "@homamru/core";
import type { CreatureDefinition } from "@homamru/core";
import type { ScenarioRun } from "./scenario.ts";

/** Проводит автобои с сидами от 1 до `count` и печатает сводку. */
export function runAutoBattles(
  count: number,
  creatures: readonly CreatureDefinition[],
): ScenarioRun {
  const wins = [0, 0];
  const failures: string[] = [];
  let rounds = 0;
  let longest = 0;
  let commands = 0;
  for (let seed = 1; seed <= count; seed += 1) {
    const run = runAutoBattle(randomBattle(seed, creatures), creatures, seed);
    const winner = run.state?.result?.winner;
    if (run.problems.length > 0 || winner === undefined) {
      failures.push(`Сид ${seed}: ${run.problems.join("; ") || "нет итога"}.`);
      continue;
    }
    wins[winner] = (wins[winner] ?? 0) + 1;
    rounds += run.state?.round ?? 0;
    longest = Math.max(longest, run.state?.round ?? 0);
    commands += run.commands.length;
  }
  const finished = count - failures.length;
  const average = finished === 0 ? 0 : Math.round((rounds * 10) / finished) / 10;
  const lines = [
    `Автобоёв: ${count}, с ошибками: ${failures.length}.`,
    `Побед нападающего: ${wins[0]}, обороняющегося: ${wins[1]}.`,
    `Раундов в бою: в среднем ${average}, самое большее ${longest}. Команд всего: ${commands}.`,
  ];
  if (failures.length > 0) {
    lines.push("Повторить бой с ошибкой: pnpm run play --autobattle <сид>");
  }
  return { ok: failures.length === 0, lines, failures };
}

/** Проводит один автобой и печатает его целиком: описание боя, команды, события, поле. */
export function showAutoBattle(
  seed: number,
  creatures: readonly CreatureDefinition[],
): ScenarioRun {
  const definition = randomBattle(seed, creatures);
  const run = runAutoBattle(definition, creatures, seed);
  const lines = [`Автобой, сид ${seed}. Описание боя:`, JSON.stringify(definition), ""];
  const created = createBattle(definition, creatures, seed);
  if (created.ok) {
    let { state } = created;
    lines.push(renderBattle(state));
    for (const [index, command] of run.commands.entries()) {
      const result = applyBattleCommand(state, command);
      if (!result.ok) {
        break;
      }
      state = result.state;
      lines.push("", `Команда ${index + 1}: ${JSON.stringify(command)}`);
      lines.push(...result.events.map((event) => `  ${formatBattleEvent(event)}`));
    }
    lines.push("", renderBattle(state));
  }
  return { ok: run.problems.length === 0, lines, failures: [...run.problems] };
}
