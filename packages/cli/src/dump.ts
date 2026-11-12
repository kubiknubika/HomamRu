/** Проигрывает дамп ошибки: повторяет партию и сверяет с состоянием из дампа. */
import { calendarOf, renderState, replay, STATE_VERSION } from "@homamru/core";
import { parseDump, sameData } from "@homamru/data";
import type { SaveDefaults } from "@homamru/data";
import type { ScenarioRun } from "./scenario.ts";

const MISMATCH = "Повтор партии не совпал с состоянием из дампа: нарушен детерминизм.";
const MISMATCH_FOREIGN =
  "Повтор партии не совпал с состоянием из дампа. Дамп сделан другой версией игры: " +
  "причиной может быть разница правил, а не ошибка.";

export function runDump(text: string, defaults: SaveDefaults): ScenarioRun {
  const parsed = parseDump(text, defaults);
  if (!parsed.ok) {
    return { ok: false, lines: [], failures: [parsed.message] };
  }
  const { dump } = parsed;
  const lines = [`Дамп от ${dump.createdAt}, версия игры ${dump.versions.game}.`];
  // Правила другой версии могли быть другими: повтор такого дампа вправе не сойтись.
  const foreign = dump.versions.state !== STATE_VERSION;
  if (foreign) {
    lines.push(
      `Дамп сделан версией состояния ${dump.versions.state}, игра понимает ${STATE_VERSION}: ` +
        "недостающее взято начальным, незнакомое убрано.",
    );
  }
  if (dump.error !== null) {
    lines.push(`Ошибка: ${dump.error.message}`, dump.error.stack ?? "(места ошибки нет)");
  }
  if (dump.game === null || dump.state === null) {
    lines.push("Партии в дампе нет: ошибка случилась до её создания.");
    return { ok: true, lines, failures: [] };
  }
  const replayed = replay(dump.game.initial, dump.game.commands);
  if (!replayed.ok) {
    const { commandIndex, rejection } = replayed;
    return {
      ok: false,
      lines,
      failures: [`Команда №${commandIndex + 1} отклонена при повторе: ${rejection.message}`],
    };
  }
  const { state } = replayed;
  const { month, week, weekday } = calendarOf(state.day);
  lines.push(`Команд в партии: ${dump.game.commands.length}.`, "", renderState(state), "");
  lines.push(`Дата: месяц ${month}, неделя ${week}, день ${weekday}.`);
  for (const hero of state.heroes) {
    lines.push(`Герой ${hero.id}: клетка (${hero.x}, ${hero.y}), запас хода ${hero.movement}.`);
  }
  const same = sameData(state, dump.state);
  return {
    ok: same,
    lines,
    failures: same ? [] : [foreign ? MISMATCH_FOREIGN : MISMATCH],
  };
}
