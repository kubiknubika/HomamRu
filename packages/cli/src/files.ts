/** Чтение карт и сценариев с диска. */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseMapFile, parseScenarioFile } from "@homamru/data";
import type { ContentResult } from "@homamru/data";
import { runScenario } from "./scenario.ts";
import type { ScenarioRun } from "./scenario.ts";

const ROOT = resolve(import.meta.dirname, "../../..");
const MAPS_DIR = join(ROOT, "data/maps");
const SCENARIOS_DIR = join(ROOT, "data/scenarios");

function fromRoot(path: string): string {
  return relative(ROOT, path);
}

function unwrap<T>(result: ContentResult<T>): T {
  if (result.ok) {
    return result.value;
  }
  const details = result.errors.map((e) => `${e.file}: ${e.field}: ${e.message}`).join("\n");
  throw new Error(details);
}

/** Пути всех файлов сценариев, по алфавиту. */
export function listScenarioFiles(): string[] {
  return readdirSync(SCENARIOS_DIR)
    .filter((name) => name.endsWith(".yaml"))
    .toSorted()
    .map((name) => join(SCENARIOS_DIR, name));
}

/** Читает сценарий и его карту и проигрывает его. Ошибка в файлах — исключение. */
export function runScenarioFile(path: string): ScenarioRun {
  const scenario = unwrap(parseScenarioFile(fromRoot(path), readFileSync(path, "utf8")));
  const mapPath = join(MAPS_DIR, `${scenario.map}.yaml`);
  const map = unwrap(parseMapFile(fromRoot(mapPath), readFileSync(mapPath, "utf8")));
  return runScenario(scenario, map);
}

/** Пути всех файлов карт, по алфавиту. */
export function listMapFiles(): string[] {
  return readdirSync(MAPS_DIR)
    .filter((name) => name.endsWith(".yaml"))
    .toSorted()
    .map((name) => join(MAPS_DIR, name));
}

/** Проверяет файл карты; возвращает список ошибок с именем файла и местом. */
export function checkMapFile(path: string): string[] {
  const result = parseMapFile(fromRoot(path), readFileSync(path, "utf8"));
  if (result.ok) {
    const expected = `${result.value.id}.yaml`;
    return path.endsWith(`/${expected}`)
      ? []
      : [`${fromRoot(path)}: id: файл должен называться ${expected}`];
  }
  return result.errors.map((e) => `${e.file}: ${e.field}: ${e.message}`);
}
