/**
 * Проигрывает сценарии из консоли и печатает ход игры.
 * Запуск из корня: pnpm run play — все сценарии; pnpm run play <файл> — один.
 * Файл .json считается дампом ошибки: партия из него повторяется и сверяется.
 * pnpm run play --autobattles [число] — сводка автобоёв (по умолчанию 1000);
 * pnpm run play --autobattle <сид> — один автобой целиком;
 * pnpm run play --rivals [число] [карта] — сводка партий «компьютер против компьютера»
 * (по умолчанию 100 партий на карте test-rivals; карта — имя файла из data/maps без расширения);
 * pnpm run play --rival <сид> [карта] — одна такая партия целиком.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runAutoBattles, showAutoBattle } from "./autobattle.ts";
import { runDump } from "./dump.ts";
import {
  listScenarioFiles,
  loadCreatures,
  loadDefaults,
  loadRivalsMap,
  runScenarioFile,
} from "./files.ts";
import { runComputerGames, showComputerGame } from "./rivals.ts";
import type { ScenarioRun } from "./scenario.ts";

function print(text: string): void {
  process.stdout.write(`${text}\n`);
}

const DEFAULT_AUTO_BATTLES = 1000;
const DEFAULT_RIVAL_GAMES = 100;

function playFiles(args: readonly string[]): boolean {
  // pnpm запускает скрипт из папки пакета, а путь игрок пишет от папки, где стоит.
  const base = process.env["INIT_CWD"] ?? process.cwd();
  const files = args.length > 0 ? args.map((arg) => resolve(base, arg)) : listScenarioFiles();
  let failed = 0;
  for (const file of files) {
    const isDump = file.endsWith(".json");
    const run = isDump
      ? runDump(readFileSync(file, "utf8"), loadDefaults())
      : runScenarioFile(file);
    print(run.lines.join("\n"));
    print("");
    if (run.ok) {
      print(isDump ? "Итог: дамп воспроизведён." : "Итог: сценарий пройден.");
    } else {
      failed += 1;
      print(isDump ? "Итог: дамп НЕ воспроизведён." : "Итог: сценарий ПРОВАЛЕН.");
      for (const failure of run.failures) {
        print(`  - ${failure}`);
      }
    }
    print("=".repeat(60));
  }
  print(`Файлов: ${files.length}, провалено: ${failed}.`);
  return failed === 0;
}

function playAuto(run: ScenarioRun): boolean {
  print(run.lines.join("\n"));
  for (const failure of run.failures) {
    print(`  - ${failure}`);
  }
  return run.ok;
}

function main(args: readonly string[]): boolean {
  const [mode, value, mapId] = args;
  if (mode === "--autobattles") {
    const count = value === undefined ? DEFAULT_AUTO_BATTLES : Number(value);
    return playAuto(runAutoBattles(count, loadCreatures()));
  }
  if (mode === "--autobattle") {
    return playAuto(showAutoBattle(Number(value ?? 1), loadCreatures()));
  }
  if (mode === "--rivals") {
    const count = value === undefined ? DEFAULT_RIVAL_GAMES : Number(value);
    return playAuto(runComputerGames(count, loadRivalsMap(mapId), loadDefaults()));
  }
  if (mode === "--rival") {
    return playAuto(showComputerGame(Number(value ?? 1), loadRivalsMap(mapId), loadDefaults()));
  }
  return playFiles(args);
}

process.exitCode = main(process.argv.slice(2)) ? 0 : 1;
