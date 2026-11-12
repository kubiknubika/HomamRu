/**
 * Проигрывает сценарии из консоли и печатает ход игры.
 * Запуск из корня: pnpm run play — все сценарии; pnpm run play <файл> — один.
 * Файл .json считается дампом ошибки: партия из него повторяется и сверяется.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runDump } from "./dump.ts";
import { listScenarioFiles, runScenarioFile } from "./files.ts";

function print(text: string): void {
  process.stdout.write(`${text}\n`);
}

const args = process.argv.slice(2);
// pnpm запускает скрипт из папки пакета, а путь игрок пишет от папки, где стоит.
const base = process.env["INIT_CWD"] ?? process.cwd();
const files = args.length > 0 ? args.map((arg) => resolve(base, arg)) : listScenarioFiles();

let failed = 0;
for (const file of files) {
  const isDump = file.endsWith(".json");
  const run = isDump ? runDump(readFileSync(file, "utf8")) : runScenarioFile(file);
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
process.exitCode = failed > 0 ? 1 : 0;
