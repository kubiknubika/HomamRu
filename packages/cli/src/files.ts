/** Чтение карт и сценариев с диска. */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type {
  BattleDefinition,
  BuildingDefinition,
  CreatureDefinition,
  MapDefinition,
} from "@homamru/core";
import {
  parseBattleFile,
  parseBattleScenarioFile,
  parseBuildingsFile,
  parseCreatureFile,
  parseDefaultsFile,
  parseMapFile,
  parseScenarioFile,
} from "@homamru/data";
import type { ContentResult, SaveDefaults } from "@homamru/data";
import { runBattleScenario } from "./battleScenario.ts";
import { runScenario } from "./scenario.ts";
import type { ScenarioRun } from "./scenario.ts";

const ROOT = resolve(import.meta.dirname, "../../..");
const MAPS_DIR = join(ROOT, "data/maps");
const SCENARIOS_DIR = join(ROOT, "data/scenarios");
const BATTLES_DIR = join(ROOT, "data/battles");
const CREATURES_DIR = join(ROOT, "data/creatures");
const BUILDINGS_FILE = join(ROOT, "data/buildings.yaml");
const DEFAULTS_FILE = join(ROOT, "data/defaults.yaml");

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

/** Все существа из папки существ, по алфавиту файлов. */
export function loadCreatures(): CreatureDefinition[] {
  return readdirSync(CREATURES_DIR)
    .filter((name) => name.endsWith(".json"))
    .toSorted()
    .map((name) => {
      const path = join(CREATURES_DIR, name);
      return unwrap(parseCreatureFile(fromRoot(path), readFileSync(path, "utf8")));
    });
}

/** Все здания игры из файла зданий. */
export function loadBuildings(): BuildingDefinition[] {
  const text = readFileSync(BUILDINGS_FILE, "utf8");
  return unwrap(parseBuildingsFile(fromRoot(BUILDINGS_FILE), text, loadCreatures()));
}

/** Читает и проверяет файл карты. Ошибка в файле — исключение. */
export function loadMap(path: string): MapDefinition {
  const text = readFileSync(path, "utf8");
  return unwrap(parseMapFile(fromRoot(path), text, loadCreatures(), loadBuildings()));
}

/** Начальные значения из контента: существа, здания и армия героя для старого сохранения. */
export function loadDefaults(): SaveDefaults {
  const text = readFileSync(DEFAULTS_FILE, "utf8");
  return unwrap(parseDefaultsFile(fromRoot(DEFAULTS_FILE), text, loadCreatures(), loadBuildings()));
}

/** Пути всех файлов боёв, по алфавиту. */
export function listBattleFiles(): string[] {
  return readdirSync(BATTLES_DIR)
    .filter((name) => name.endsWith(".yaml"))
    .toSorted()
    .map((name) => join(BATTLES_DIR, name));
}

/** Читает файл боя. Ошибка в файле — исключение. */
export function loadBattle(path: string): BattleDefinition {
  return unwrap(parseBattleFile(fromRoot(path), readFileSync(path, "utf8")));
}

/**
 * Читает сценарий и проигрывает его. Сценарий с полем `battle` — сценарий боя,
 * остальные — сценарии карты. Ошибка в файлах — исключение.
 */
export function runScenarioFile(path: string): ScenarioRun {
  const text = readFileSync(path, "utf8");
  if (/^battle:/m.test(text)) {
    const battleScenario = unwrap(parseBattleScenarioFile(fromRoot(path), text));
    const battle = loadBattle(join(BATTLES_DIR, `${battleScenario.battle}.yaml`));
    return runBattleScenario(battleScenario, battle, loadCreatures());
  }
  const scenario = unwrap(parseScenarioFile(fromRoot(path), text));
  const mapPath = join(MAPS_DIR, `${scenario.map}.yaml`);
  return runScenario(scenario, loadMap(mapPath), loadCreatures(), loadBuildings());
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
  const result = parseMapFile(
    fromRoot(path),
    readFileSync(path, "utf8"),
    loadCreatures(),
    loadBuildings(),
  );
  if (result.ok) {
    const expected = `${result.value.id}.yaml`;
    return path.endsWith(`/${expected}`)
      ? []
      : [`${fromRoot(path)}: id: файл должен называться ${expected}`];
  }
  return result.errors.map((e) => `${e.file}: ${e.field}: ${e.message}`);
}
